import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
# import pandas as pd # Removed due to DLL load failures on Python 3.14
from datetime import datetime
import asyncio
from supabase import create_client, Client
from weather_service import WeatherService
from weather_config import THRESHOLDS, DVS_PASS_THRESHOLD
from aqi_service import AQIService
from news_service import NewsService

load_dotenv()

# App-level Supabase client
supabase: Client = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global supabase
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not url or not key:
        raise Exception("Missing SUPABASE_URL or SUPABASE_KEY in .env")
    supabase = create_client(url, key)
    print("Startup: Initialized Supabase client successfully")
    
    # Start weather, AQI & News background tasks
    asyncio.create_task(weather_background_loop())
    asyncio.create_task(aqi_background_loop())
    asyncio.create_task(news_background_loop())
    
    yield
    print("Shutdown: Cleaning up resources")

app = FastAPI(
    title="InFin Backend API",
    description="Engine 1 & 2 for Platform Worker Income Protection",
    lifespan=lifespan
)

# Allow React / Vite frontend to communicate
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Change in prod to actual frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {"status": "ok", "message": "InFin Engine Router is Online"}

@app.get("/api/v1/policy/quote")
async def get_policy_quote(user_id: str):
    if not supabase:
        raise HTTPException(status_code=500, detail="Database connection error")
        
    try:
        from datetime import timezone, timedelta
        now = datetime.now(timezone.utc)

        # 1. Fetch worker
        worker_res = supabase.table("workers").select("*").eq("id", user_id).execute()
        worker = worker_res.data[0] if worker_res.data else None
        
        if not worker:
            raise HTTPException(status_code=404, detail="Worker not found")
            
        city = worker.get("city")
        print(f"[Engine 1] Worker city from DB: '{city}'")
        
        # 2. Disruption Probability
        # Calculate the weighted average of DP for the wards the user is a part of
        affinity_res = supabase.table("worker_ward_affinity").select("ward_id, affinity_score").eq("worker_id", user_id).execute()
        disruption_probability = 0.05 # default fallback
        
        if affinity_res.data:
            total_dp = 0.0
            total_affinity = 0.0
            for aff in affinity_res.data:
                w_id = aff['ward_id']
                score = float(aff['affinity_score'])
                dp_res = supabase.table("dp_table").select("dp_value").eq("ward_id", w_id).order("date", desc=True).limit(1).execute()
                if dp_res.data and dp_res.data[0].get('dp_value') is not None:
                    total_dp += float(dp_res.data[0]['dp_value']) * score
                    total_affinity += score
            if total_affinity > 0:
                disruption_probability = total_dp / total_affinity
        else:
            # New user fallback: average DP of all wards in their city
            wards_res = supabase.table("wards").select("id").ilike("city", f"%{city}%").execute()
            if wards_res.data:
                w_ids = [w['id'] for w in wards_res.data]
                if w_ids:
                    dp_res = supabase.table("dp_table").select("dp_value").in_("ward_id", w_ids).execute()
                    if dp_res.data:
                        vals = [float(row['dp_value']) for row in dp_res.data if row.get('dp_value') is not None]
                        if vals:
                            disruption_probability = sum(vals) / len(vals)
        
        print(f"[Engine 1] Calculated DP: {disruption_probability}")

        # 3. Dynamic Conflict Ratio
        # Ratio of claims processed vs active policies in the last 30 days
        thirty_days_ago = now - timedelta(days=30)
        active_policies_count_res = supabase.table("policies").select("id", count="exact").execute()
        active_count = active_policies_count_res.count if active_policies_count_res.count is not None else 1
        
        claims_count_res = supabase.table("claims").select("id", count="exact").eq("status", "approved").execute()
        claims_count = claims_count_res.count if claims_count_res.count is not None else 0
        
        conflict_ratio = 0.70 # Default stable ratio
        if active_count > 0:
            raw_ratio = min(2.0, (claims_count / active_count) * 10) # Scaled for premium weighting
            conflict_ratio = (0.7 * conflict_ratio) + (0.3 * raw_ratio)
            
        # 4. Fetch enrollment age to handle New Users (< 7 days)
        try:
            created_at_dt = datetime.fromisoformat(worker.get("created_at").replace('Z', '+00:00'))
            if not created_at_dt.tzinfo:
                created_at_dt = created_at_dt.replace(tzinfo=timezone.utc)
            enrollment_days = (now - created_at_dt).days
        except Exception:
            enrollment_days = 0 # Default to new if parse fails
            
        is_new_user = enrollment_days < 7

        # 5. Determine Expected Daily Earnings (EDE)
        expected_daily_earnings = 800 # Fallback default
        
        if is_new_user:
            # NEW USER LOGIC: Use City Average Earnings from other workers' active policies
            city_workers_res = supabase.table("workers").select("id").eq("city", city).neq("id", user_id).execute()
            city_worker_ids = [w['id'] for w in city_workers_res.data] if city_workers_res.data else []
            
            if city_worker_ids:
                p_res = supabase.table("policies").select("expected_daily_earnings").in_("worker_id", city_worker_ids).eq("status", "active").execute()
                valid_earnings = [int(p['expected_daily_earnings']) for p in p_res.data if p.get('expected_daily_earnings') is not None]
                if valid_earnings:
                    expected_daily_earnings = sum(valid_earnings) / len(valid_earnings)
            print(f"[Engine 1] New User (<7 days). Using city average from policies: {expected_daily_earnings}")
        else:
            # EXISTING USER: Fetch individual trip data from worker_orders
            orders_res = supabase.table("worker_orders").select("earning, created_at").eq("worker_id", user_id).gte("created_at", thirty_days_ago.isoformat()).execute()
            
            if orders_res.data:
                # Daily Aggregation (Sum of earnings per day)
                daily_sums = {}
                for row in orders_res.data:
                    dt_str = row.get('created_at').split('T')[0]
                    earning = float(row.get('earning', 0))
                    daily_sums[dt_str] = daily_sums.get(dt_str, 0) + earning
                
                # Sort dates chronologically for EMA
                sorted_dates = sorted(daily_sums.keys())
                daily_values = [daily_sums[d] for d in sorted_dates]
                
                if len(daily_values) >= 1:
                    # ML Model: Exponential Smoothing (Alpha 0.25)
                    alpha = 0.25
                    ema = daily_values[0]
                    for val in daily_values[1:]:
                        ema = (val * alpha) + (ema * (1 - alpha))
                    expected_daily_earnings = ema
                    print(f"[Engine 1] EMA calculated for worker {user_id} over {len(daily_values)} days: {expected_daily_earnings}")
                
        # 6. Engine 1 Formula: Calculate Weekly Premium
        weekly_premium = round(expected_daily_earnings * disruption_probability * conflict_ratio * 1.15 / 0.65)
        
        if weekly_premium > 100:
            weekly_premium = 100
            
        return {
            "worker_id": user_id,
            "expected_daily_earnings": round(expected_daily_earnings),
            "disruption_probability": disruption_probability,
            "conflict_ratio": round(conflict_ratio, 2),
            "weekly_premium": weekly_premium
        }
        
    except Exception as e:
        print(f"Error calculating quote: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class SubscribeRequest(BaseModel):
    worker_id: str
    policy_cost: int
    expected_daily_earnings: int
    disruption_probability: float


@app.post("/api/v1/policy/subscribe")
async def subscribe_policy(req: SubscribeRequest):
    """
    Called after the user confirms payment.
    Creates a new record in the policies table to track the active insurance contract.
    """
    if not supabase:
        raise HTTPException(status_code=500, detail="Database connection error")

    try:
        from datetime import timezone, timedelta

        now = datetime.now(timezone.utc)
        next_due = now + timedelta(days=8)

        # Check if the worker already has an active policy to avoid duplicates
        existing = supabase.table("policies") \
            .select("id, status") \
            .eq("worker_id", req.worker_id) \
            .eq("status", "active") \
            .execute()

        if existing.data:
            raise HTTPException(
                status_code=409,
                detail="Worker already has an active policy. Please wait until the current policy lapses."
            )

        # Insert new policy record
        new_policy = {
            "worker_id": req.worker_id,
            "policy_cost": req.policy_cost,
            "expected_daily_earnings": req.expected_daily_earnings,
            "disruption_probability": req.disruption_probability,
            "coverage_start_at": now.isoformat(),
            "next_due_date": next_due.isoformat(),
            "status": "active",
            "cumulative_weeks_count": 1,
            "cumulative_amount_collected": float(req.policy_cost),
        }

        result = supabase.table("policies").insert(new_policy).execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create policy record")

        policy_id = result.data[0]["id"]
        print(f"[Engine 1] Policy created: {policy_id} for worker {req.worker_id}")

        # Record the successful payment
        new_payment = {
            "policy_id": policy_id,
            "amount": req.policy_cost,
            "status": "success",
            "transaction_ref": f"sub_{int(now.timestamp())}",
            "paid_at": now.isoformat()
        }
        supabase.table("payments").insert(new_payment).execute()
        print(f"[Engine 1] Payment recorded for policy {policy_id}")

        return {
            "success": True,
            "policy_id": policy_id,
            "status": "active",
            "next_due_date": next_due.isoformat(),
            "message": "Policy activated successfully"
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"[Engine 1] Error creating policy: {e}")
        raise HTTPException(status_code=500, detail=str(e))



from razorpay_provider import create_razorpay_order

class OrderRequest(BaseModel):
    amount: float
    currency: str = "INR"

@app.post("/create-order")
async def create_order(req: OrderRequest):
    try:
        # Amount in INR; razorpay_provider handles paise conversion
        order = create_razorpay_order(amount_inr=req.amount, currency=req.currency)
        return {"order_id": order["id"], "amount": order["amount"], "currency": order["currency"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

from engine2 import router as engine2_router
app.include_router(engine2_router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)


# ─────────────────────────────────────────────────────────────
# WEEKLY RENEWAL — called when the worker pays their next week
# Increments the cumulative aggregates on time.
# ─────────────────────────────────────────────────────────────
class RenewRequest(BaseModel):
    policy_id: str


@app.post("/api/v1/policy/renew")
async def renew_policy(req: RenewRequest):
    """
    Called when the worker pays their next weekly premium on time.
    Increments cumulative_weeks_count and cumulative_amount_collected.
    Moves next_due_date forward by 7 days.
    """
    if not supabase:
        raise HTTPException(status_code=500, detail="Database connection error")

    try:
        from datetime import timezone, timedelta

        # Fetch the current policy
        res = supabase.table("policies").select("*").eq("id", req.policy_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Policy not found")

        policy = res.data[0]

        if policy["status"] == "lapsed":
            raise HTTPException(
                status_code=400,
                detail="Policy has lapsed. Worker must subscribe again to start a new cumulative period."
            )

        now = datetime.now(timezone.utc)
        new_weeks = policy["cumulative_weeks_count"] + 1
        new_amount = policy["cumulative_amount_collected"] + policy["policy_cost"]
        
        # Add 7 days to the existing due date instead of now so early renewers don't lose days
        try:
            current_due = datetime.fromisoformat(str(policy["next_due_date"]).replace('Z', '+00:00'))
        except Exception:
            current_due = now
        
        new_due = current_due + timedelta(days=7)

        updated = supabase.table("policies").update({
            "cumulative_weeks_count": new_weeks,
            "cumulative_amount_collected": new_amount,
            "next_due_date": new_due.isoformat(),
            "status": "active",
        }).eq("id", req.policy_id).execute()

        # Record the successful renewal payment
        new_payment = {
            "policy_id": req.policy_id,
            "amount": policy["policy_cost"],
            "status": "success",
            "transaction_ref": f"rnw_{int(now.timestamp())}",
            "paid_at": now.isoformat()
        }
        supabase.table("payments").insert(new_payment).execute()

        print(f"[Renewal] Policy {req.policy_id} renewed — week {new_weeks}, total ₹{new_amount}")

        return {
            "success": True,
            "policy_id": req.policy_id,
            "cumulative_weeks_count": new_weeks,
            "cumulative_amount_collected": new_amount,
            "next_due_date": new_due.isoformat(),
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"[Renewal] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────
# LAPSE DETECTION — run daily via cron or admin trigger
# Scans all active policies whose next_due_date has passed
# and resets cumulative values to 0, marking status = lapsed.
# ─────────────────────────────────────────────────────────────
@app.post("/api/v1/policy/check-lapses")
async def check_lapsed_policies():
    """
    Should be called by a daily scheduled job.
    Finds all active policies past their next_due_date and lapses them,
    resetting cumulative_weeks_count and cumulative_amount_collected to 0.
    """
    if not supabase:
        raise HTTPException(status_code=500, detail="Database connection error")

    try:
        from datetime import timezone, timedelta

        now = datetime.now(timezone.utc)

        # 48-HOUR GRACE PERIOD: only lapse policies where due date passed > 2 days ago
        grace_deadline = (now - timedelta(hours=48)).isoformat()

        # Fetch all active policies past their grace deadline
        active_res = supabase.table("policies") \
            .select("id, worker_id, next_due_date, cumulative_weeks_count, cumulative_amount_collected") \
            .eq("status", "active") \
            .lt("next_due_date", grace_deadline) \
            .execute()

        lapsed_ids = [p["id"] for p in active_res.data]
        lapsed_count = len(lapsed_ids)

        if lapsed_count == 0:
            return {"success": True, "lapsed_count": 0, "message": "No policies to lapse (within grace period)."}

        LOYALTY_STREAK_WEEKS = 24  # Full chit fund cycle = 6 months
        settlements_triggered = 0

        for policy in active_res.data:
            policy_id = policy["id"]
            weeks = policy["cumulative_weeks_count"]
            amount = float(policy["cumulative_amount_collected"])

            # 24-WEEK CHIT FUND LOGIC
            if weeks >= LOYALTY_STREAK_WEEKS:
                # Worker completed the unbroken 24-week streak — trigger settlement
                claims_res = supabase.table("claims") \
                    .select("id", count="exact") \
                    .eq("policy_id", policy_id) \
                    .eq("status", "approved") \
                    .execute()
                claim_count = claims_res.count if claims_res.count is not None else 0

                # Return % based on claim history:
                #   0 claims  -> 80-90% (85%)
                #   1 claim   -> 15%
                #   2+ claims -> 10%  (minimum)
                if claim_count == 0:
                    return_pct = 0.85
                elif claim_count == 1:
                    return_pct = 0.15
                else:
                    return_pct = 0.10

                return_amount = int(amount * return_pct)

                supabase.table("loyalty_settlements").insert({
                    "policy_id": policy_id,
                    "total_premiums_paid": int(amount),
                    "claim_count": claim_count,
                    "return_percentage": return_pct,
                    "return_amount": return_amount,
                    "settled_at": now.isoformat()
                }).execute()

                # --- NEW: Automated Bonus Payout Recording ---
                supabase.table("payments").insert({
                    "policy_id": policy_id,
                    "amount": -int(return_amount), # Negative to indicate outflow
                    "status": "success",
                    "transaction_ref": f"payout_bonus_{policy_id[:8]}",
                    "paid_at": now.isoformat()
                }).execute()

                settlements_triggered += 1
                print(f"[Lapse] LOYALTY BONUS: Policy {policy_id} | 24-week streak | Claims={claim_count} | Return={return_pct*100:.0f}% | Payout=Rs.{return_amount}")
            else:
                # Streak broken — missed a weekly payment, no bonus
                print(f"[Lapse] STREAK BROKEN: Policy {policy_id} lapsed at week {weeks}/24 — no loyalty bonus")

            # In both cases, lapse and reset streak
            supabase.table("policies").update({
                "status": "lapsed",
                "cumulative_weeks_count": 0,
                "cumulative_amount_collected": 0.0,
            }).eq("id", policy_id).execute()

        return {
            "success": True,
            "lapsed_count": lapsed_count,
            "settlements_triggered": settlements_triggered,
            "message": f"{lapsed_count} policies lapsed, {settlements_triggered} loyalty settlements triggered."
        }


    except Exception as e:
        print(f"[Lapse] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────
# CLAIM RESET — called by Engine 2 after a payout is made
# Resets cumulative aggregates because claim payment
# closes the current protection period.
# ─────────────────────────────────────────────────────────────
class ClaimResetRequest(BaseModel):
    policy_id: str


@app.post("/api/v1/policy/reset-on-claim")
async def reset_policy_on_claim(req: ClaimResetRequest):
    """
    Called by Engine 2 after a disruption payout has been made.
    Resets cumulative_weeks_count and cumulative_amount_collected to 0
    and marks the policy as lapsed (claim period is now closed).
    The worker must subscribe again to start a fresh protection period.
    """
    if not supabase:
        raise HTTPException(status_code=500, detail="Database connection error")

    try:
        res = supabase.table("policies").select("id, status").eq("id", req.policy_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Policy not found")

        supabase.table("policies").update({
            "status": "lapsed",
            "cumulative_weeks_count": 0,
            "cumulative_amount_collected": 0.0,
        }).eq("id", req.policy_id).execute()

        print(f"[ClaimReset] Policy {req.policy_id} reset after payout — cumulatives = 0")

        return {
            "success": True,
            "policy_id": req.policy_id,
            "message": "Policy cumulatives reset after claim payout. Policy is now lapsed."
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"[ClaimReset] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────
# WEATHER INTELLIGENCE SYSTEM
# ─────────────────────────────────────────────────────────────

async def weather_background_loop():
    """Refreshes weather every 60 minutes and triggers disruptions if needed."""
    service = WeatherService(supabase)
    while True:
        try:
            print("[WeatherSync] Starting hourly weather refresh...")
            for city in ["Chennai", "Bangalore", "Hyderabad", "Mumbai", "Delhi"]:
                weather = await service.fetch_city_weather(city)
                if weather:
                    await evaluate_weather_for_disruption(weather)
            
            print("[WeatherSync] Refresh complete. Sleeping for 1 hour.")
        except Exception as e:
            print(f"[WeatherSync] Loop error: {e}")
        
        await asyncio.sleep(3600) # 1 hour

async def evaluate_weather_for_disruption(weather: dict):
    """Automatically triggers zone_disruption_events if Gate 1 DVS score >= 0.70."""
    city = weather['city']
    dvs_score = weather.get('dvs_score', 0.0)
    rain_mm = weather.get('rain_mm', 0.0)
    
    is_disrupted = dvs_score >= DVS_PASS_THRESHOLD
    disruption_type = "Severe Weather (Gate 1 Passed)"
        
    if is_disrupted:
        print(f"[WeatherAlert] Gate 1 Passed for {city} | DVS={dvs_score:.2f}. Triggering ward disruptions...")
        
        # 1. Fetch all wards in this city
        wards_res = supabase.table("wards").select("id").ilike("city", f"%{city}%").execute()
        ward_ids = [w['id'] for w in wards_res.data] if wards_res.data else []
        
        if ward_ids:
            from datetime import timezone
            now_iso = datetime.now(timezone.utc).isoformat()
            
            # 2. Insert disruption events for all wards
            events = []
            for w_id in ward_ids:
                # Check if an active one already exists to avoid spamming
                existing = supabase.table("zone_disruption_events").select("id").eq("ward_id", w_id).eq("is_active", True).execute()
                if not existing.data:
                    events.append({
                        "ward_id": w_id,
                        "is_active": True,
                        "rain": float(rain_mm),
                        "flood": 0.0,
                        "aqi": 50.0,
                        "heat": float(weather.get('temperature_c', 0)),
                        "lockdown": False,
                        "strike": False,
                        "created_at": now_iso
                    })
            
            if events:
                supabase.table("zone_disruption_events").insert(events).execute()
                print(f"[WeatherAlert] Created {len(events)} disruption events for {city}")

@app.get("/api/weather/{city}")
async def get_city_weather(city: str):
    """Fetch cached weather data for a city."""
    if not supabase:
        raise HTTPException(status_code=500, detail="Database connection error")
        
    res = supabase.table("weather_snapshots").select("*").ilike("city", f"%{city}%").limit(1).execute()
    if not res.data:
        # Try a fresh fetch if not in cache
        service = WeatherService(supabase)
        data = await service.fetch_city_weather(city)
        if not data:
            raise HTTPException(status_code=404, detail=f"Weather data for {city} not found")
        return data
        
    return res.data[0]


# ─────────────────────────────────────────────────────────────
# AQI INTELLIGENCE SYSTEM
# ─────────────────────────────────────────────────────────────

async def aqi_background_loop():
    """Refreshes AQI data every 60 minutes and triggers disruptions if needed."""
    service = AQIService(supabase)
    while True:
        try:
            print("[AQISync] Starting hourly AQI refresh...")
            for city in ["Chennai", "Bangalore", "Hyderabad", "Mumbai", "Delhi"]:
                aqi_data = await service.fetch_city_aqi(city)
                if aqi_data:
                    await evaluate_aqi_for_disruption(aqi_data)
            print("[AQISync] Refresh complete. Sleeping for 1 hour.")
        except Exception as e:
            print(f"[AQISync] Loop error: {e}")

        await asyncio.sleep(3600)  # 1 hour

async def evaluate_aqi_for_disruption(aqi_data: dict):
    """Triggers zone_disruption_events if Gate 1 AQI DVS score >= 0.70."""
    city = aqi_data["city"]
    dvs_score = aqi_data.get("dvs_score", 0.0)
    aqi_value = aqi_data.get("aqi", 0.0)

    if dvs_score >= DVS_PASS_THRESHOLD:
        print(f"[AQIAlert] Gate 1 Passed for {city} | AQI={aqi_value}, DVS={dvs_score:.2f}. Triggering ward disruptions...")

        wards_res = supabase.table("wards").select("id").ilike("city", f"%{city}%").execute()
        ward_ids = [w["id"] for w in wards_res.data] if wards_res.data else []

        if ward_ids:
            from datetime import timezone as tz
            now_iso = datetime.now(tz.utc).isoformat()
            events = []
            for w_id in ward_ids:
                existing = supabase.table("zone_disruption_events").select("id").eq("ward_id", w_id).eq("is_active", True).execute()
                if not existing.data:
                    events.append({
                        "ward_id": w_id,
                        "is_active": True,
                        "rain": 0.0,
                        "flood": 0.0,
                        "aqi": float(aqi_value),
                        "heat": 0.0,
                        "lockdown": False,
                        "strike": False,
                        "created_at": now_iso
                    })
            if events:
                supabase.table("zone_disruption_events").insert(events).execute()
                print(f"[AQIAlert] Created {len(events)} AQI disruption events for {city}")

@app.get("/api/aqi/{city}")
async def get_city_aqi(city: str):
    """Fetch cached AQI data for a city."""
    if not supabase:
        raise HTTPException(status_code=500, detail="Database connection error")

    res = supabase.table("aqi_snapshots").select("*").ilike("city", f"%{city}%").limit(1).execute()
    if not res.data:
        # Try a fresh fetch if not in cache
        service = AQIService(supabase)
        data = await service.fetch_city_aqi(city)
        if not data:
            raise HTTPException(status_code=404, detail=f"AQI data for '{city}' not found. Ensure the city is supported and the aqi_snapshots table exists in Supabase.")
        return data

    return res.data[0]


# ─────────────────────────────────────────────────────────────
# NEWS DISRUPTION SYSTEM
# ─────────────────────────────────────────────────────────────

async def news_background_loop():
    """Refreshes disruption news every 60 minutes and triggers disruptions if needed."""
    service = NewsService(supabase)
    while True:
        try:
            print("[NewsSync] Starting hourly news refresh...")
            for city in ["Chennai", "Bangalore", "Hyderabad", "Mumbai", "Delhi"]:
                news_data = await service.fetch_city_news(city)
                if news_data:
                    await evaluate_news_for_disruption(news_data)
            print("[NewsSync] Refresh complete. Sleeping for 1 hour.")
        except Exception as e:
            print(f"[NewsSync] Loop error: {e}")

        await asyncio.sleep(3600)  # 1 hour

async def evaluate_news_for_disruption(news_data: dict):
    """Triggers zone_disruption_events if Gate 1 News DVS score >= 0.70."""
    city = news_data["city"]
    dvs_score = news_data.get("dvs_score", 0.0)
    headline = news_data.get("headline", "")

    if dvs_score >= DVS_PASS_THRESHOLD:
        print(f"[NewsAlert] Gate 1 Passed for {city} | DVS={dvs_score:.2f} | Event: {headline}. Triggering ward disruptions...")

        wards_res = supabase.table("wards").select("id").ilike("city", f"%{city}%").execute()
        ward_ids = [w["id"] for w in wards_res.data] if wards_res.data else []

        if ward_ids:
            from datetime import timezone as tz
            now_iso = datetime.now(tz.utc).isoformat()
            events = []
            for w_id in ward_ids:
                existing = supabase.table("zone_disruption_events").select("id").eq("ward_id", w_id).eq("is_active", True).execute()
                if not existing.data:
                    events.append({
                        "ward_id": w_id,
                        "is_active": True,
                        "rain": 0.0,
                        "flood": 0.0,
                        "aqi": 0.0,
                        "heat": 0.0,
                        "lockdown": True if "bandh" in headline.lower() or "lockdown" in headline.lower() else False,
                        "strike": True,
                        "created_at": now_iso
                    })
            if events:
                supabase.table("zone_disruption_events").insert(events).execute()
                print(f"[NewsAlert] Created {len(events)} news-based disruption events for {city}")

@app.get("/api/news/{city}")
async def get_city_news(city: str):
    """Fetch cached news data for a city."""
    if not supabase:
        raise HTTPException(status_code=500, detail="Database connection error")

    res = supabase.table("disruption_news").select("*").ilike("city", f"%{city}%").limit(1).execute()
    if not res.data:
        # Try a fresh fetch if not in cache
        service = NewsService(supabase)
        data = await service.fetch_city_news(city)
        if not data:
            return {"city": city, "headline": None, "message": "No recent disruptions detected"}
        return data

    return res.data[0]
