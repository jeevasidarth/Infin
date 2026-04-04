import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
# import pandas as pd # Removed due to DLL load failures on Python 3.14
from datetime import datetime
from supabase import create_client, Client

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
        # 1. Fetch worker
        worker_res = supabase.table("workers").select("*").eq("id", user_id).execute()
        worker = worker_res.data[0] if worker_res.data else None
        
        if not worker:
            raise HTTPException(status_code=404, detail="Worker not found")
            
        city = worker.get("city")
        print(f"[Engine 1] Worker city from DB: '{city}'")
        
        # 2. Fetch DP value for the city — use ilike for case-insensitive matching
        dp_res = supabase.table("dp_table").select("dp_value").ilike("city", city).execute()
        print(f"[Engine 1] DP table result: {dp_res.data}")
        disruption_probability = dp_res.data[0]['dp_value'] if dp_res.data else 0.05
        
        # 3. Fetch earnings history. Since it's hourly cumulative now, fetch enough rows and get max per day
        # Supabase API limits might apply, but 300 should cover ~12 days of hourly pinging
        earnings_res = supabase.table("earnings_history").select("date", "ts", "earnings").eq("worker_id", user_id).order("date", desc=True).limit(300).execute()
        
        expected_daily_earnings = 800 # fallback
        
        if earnings_res.data:
            # PURE PYTHON: Group by date and find max earnings per day
            daily_max = {}
            for row in earnings_res.data:
                d = row.get('date')
                try:
                    val = float(row.get('earnings', 0))
                except (ValueError, TypeError):
                    val = 0
                if d:
                    if d not in daily_max or val > daily_max[d]:
                        daily_max[d] = val
            
            # Sort chronologically for EMA
            sorted_dates = sorted(daily_max.keys())
            daily_values = [daily_max[d] for d in sorted_dates]
            
            if daily_values:
                # Simple EMA (span=7)
                alpha = 2 / (7 + 1)
                ema = daily_values[0]
                for val in daily_values[1:]:
                    ema = (val * alpha) + (ema * (1 - alpha))
                expected_daily_earnings = ema
                
        # 4. Engine 1 Formula Calculate Premium
        weekly_premium = round(expected_daily_earnings * disruption_probability * 0.70 * 1.15 / 0.65)
        
        return {
            "worker_id": user_id,
            "expected_daily_earnings": round(expected_daily_earnings),
            "disruption_probability": disruption_probability,
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
        from datetime import timezone

        now = datetime.now(timezone.utc)

        # Fetch all active policies where due date has passed
        active_res = supabase.table("policies") \
            .select("id, worker_id, next_due_date, cumulative_weeks_count, cumulative_amount_collected") \
            .eq("status", "active") \
            .lt("next_due_date", now.isoformat()) \
            .execute()

        lapsed_ids = [p["id"] for p in active_res.data]
        lapsed_count = len(lapsed_ids)

        if lapsed_count == 0:
            return {"success": True, "lapsed_count": 0, "message": "No policies to lapse."}

        # Reset cumulative fields and mark as lapsed for all overdue policies
        for policy_id in lapsed_ids:
            supabase.table("policies").update({
                "status": "lapsed",
                "cumulative_weeks_count": 0,
                "cumulative_amount_collected": 0.0,
            }).eq("id", policy_id).execute()
            print(f"[Lapse] Policy {policy_id} lapsed — cumulatives reset to 0")

        return {
            "success": True,
            "lapsed_count": lapsed_count,
            "lapsed_policy_ids": lapsed_ids,
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
