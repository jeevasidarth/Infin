from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta
from typing import Optional

router = APIRouter()

@router.post("/api/v1/engine/evaluate")
async def evaluate_claims(simulated_time: Optional[str] = Query(None, description="ISO datetime string to simulate fast-forwarding")):
    """
    Hourly cron endpoint for Engine 2 validation.
    Phase 1: Active -> Pending (Ward Affinity & Gate 1)
    Phase 2: Pending -> Lapsed (Finalize Claim & Payout)
    """
    from main import supabase
    if not supabase:
        raise HTTPException(status_code=500, detail="Database connection error")
        
    try:
        if simulated_time:
            now = datetime.fromisoformat(simulated_time.replace('Z', '+00:00'))
            if not now.tzinfo:
                now = now.replace(tzinfo=timezone.utc)
        else:
            now = datetime.now(timezone.utc)
        
        fourteen_days_ago = now - timedelta(days=14)

        # -------------------------------------------------------------
        # PHASE 1: ACTIVE -> PENDING (Ward Affinity & Gate 1)
        # -------------------------------------------------------------
        active_policies = supabase.table("policies").select("id, worker_id, coverage_start_at, expected_daily_earnings").eq("status", "active").execute()
        
        for policy in active_policies.data:
            worker_id = policy['worker_id']
            
            # --- WARD AFFINITY CALCULATION ---
            orders_res = supabase.table("worker_orders").select("*").eq("worker_id", worker_id).gte("created_at", fourteen_days_ago.isoformat()).lte("created_at", now.isoformat()).execute()
            orders = orders_res.data
            
            if not orders:
                continue # Minimum activity requirement
                
            ward_earnings = {}
            ward_time = {}
            total_earnings = 0
            total_time = 0
            
            for o in orders:
                pickup = o.get('pickup_ward_id')
                drop = o.get('drop_ward_id')
                inter = o.get('intermediate_wards_ids', [])
                earning = o.get('earning', 0)
                duration = o.get('duration_minutes', 0)
                
                # Earnings Split
                if pickup:
                    ward_earnings[pickup] = ward_earnings.get(pickup, 0) + (earning * 0.43)
                if drop:
                    ward_earnings[drop] = ward_earnings.get(drop, 0) + (earning * 0.37)
                if inter and len(inter) > 0:
                    inter_split = (earning * 0.20) / len(inter)
                    for w in inter:
                        ward_earnings[w] = ward_earnings.get(w, 0) + inter_split
                
                total_earnings += earning
                
                # Time Split
                route_wards = []
                if pickup: route_wards.append(pickup)
                if drop: route_wards.append(drop)
                route_wards.extend(inter)
                
                # Remove duplicates for time split to be fair, or keep them if they represent sequential visits
                # Usually we just divide equally among unique wards in route
                route_wards = list(set(route_wards))
                
                if len(route_wards) > 0:
                    time_split = duration / len(route_wards)
                    for w in route_wards:
                        ward_time[w] = ward_time.get(w, 0) + time_split
                    total_time += duration
            
            if total_earnings == 0 or total_time == 0:
                continue
                
            # Normalize and Calculate Affinity
            all_wards = set(list(ward_earnings.keys()) + list(ward_time.keys()))
            affinities = {}
            
            for w in all_wards:
                e_norm = ward_earnings.get(w, 0) / total_earnings
                t_norm = ward_time.get(w, 0) / total_time
                affinity = (0.72 * e_norm) + (0.28 * t_norm)
                
                if affinity >= 0.05: # Ignore negligible wards
                    affinities[w] = affinity
                    
                    # Update local database cache
                    # Upsert requires checking if exists, or just insert (simpler for prototyping, wipe old first)
            
            # Wipe old cached affinities
            supabase.table("worker_ward_affinity").delete().eq("worker_id", worker_id).execute()
            
            # Insert new ones
            affinity_inserts = []
            for w, aff in affinities.items():
                affinity_inserts.append({
                    "worker_id": worker_id,
                    "ward_id": w,
                    "affinity_score": aff,
                    "calculated_on": now.isoformat()
                })
            if affinity_inserts:
                supabase.table("worker_ward_affinity").insert(affinity_inserts).execute()
                
            # --- GATE 1: DISRUPTION IMPACT ---
            # Check for active disruptions in these wards
            disrupted_wards = []
            disruption_event_ids = []
            remaining_affinity = 0.0
            combined_disrupted_affinity = 0.0
            earliest_event_start = None
            
            for w, aff in affinities.items():
                # Get active disruption for this ward
                event_res = supabase.table("zone_disruption_events").select("*").eq("ward_id", w).eq("is_active", True).lte("created_at", now.isoformat()).order("created_at", desc=True).limit(1).execute()
                
                if event_res.data:
                    event = event_res.data[0]
                    disrupted_wards.append(w)
                    disruption_event_ids.append(event['id'])
                    combined_disrupted_affinity += aff
                    
                    e_start = datetime.fromisoformat(event['created_at'].replace('Z', '+00:00'))
                    if earliest_event_start is None or e_start < earliest_event_start:
                        earliest_event_start = e_start
                else:
                    remaining_affinity += aff
                    
                MANAGABLE_INCOME_THRESHOLD = 0.60 # If user can still earn 60% in other wards, they can manage.
                
                # 'remaining_affinity' is the sum of affinities for non-disrupted wards
                if combined_disrupted_affinity > 0:
                    # User is only disrupted if their REMAINING income capacity is low
                    if remaining_affinity >= MANAGABLE_INCOME_THRESHOLD:
                        print(f"[Engine 2 Gate 1] Worker {worker_id} filtered out. Can manage with {remaining_affinity:.2%} remaining capacity.")
                        gate1_passed = False
                    else:
                        print(f"[Engine 2 Gate 1] Worker {worker_id} disrupted. Remaining capacity {remaining_affinity:.2%} is below threshold.")
                        gate1_passed = True
                else:
                    gate1_passed = False
            
            if gate1_passed:
                # Check if claim already exists
                existing_claim = supabase.table("claims").select("id").eq("policy_id", policy['id']).eq("status", "pending").execute()
                if existing_claim.data:
                    print(f"[Engine 2 Phase 1] Skipping policy {policy['id']} - Claim already pending.")
                    continue

                # --- GATE 2: ZPCS — Zone Peer Comparison ---
                # "Reject if most people worked despite the disruption"
                ZPCS_THRESHOLD = 0.50
                weighted_peer_working_pct = 0.0
                total_weight = 0.0
                today_date = now.date().isoformat()

                for d_ward in disrupted_wards:
                    peer_res = supabase.table("peer_activity").select("percent_working").eq("ward_id", d_ward).eq("date", today_date).execute()
                    if peer_res.data:
                        working_pct = peer_res.data[0].get('percent_working', 0.0)
                        # Weight it by the affinity score they have for this ward to be mathematically fair
                        ward_weight = affinities[d_ward]
                        weighted_peer_working_pct += (working_pct * ward_weight)
                        total_weight += ward_weight

                if total_weight > 0:
                    avg_peer_working_pct = weighted_peer_working_pct / total_weight
                    # If > 50% are working, our worker "could have worked but didn't" -> FAIL
                    zpcs_passed = avg_peer_working_pct <= ZPCS_THRESHOLD
                    print(f"[Engine 2 Gate 2] Worker {worker_id} — weighted_avg_working={avg_peer_working_pct:.2%}, ZPCS={'PASS (Disruption was severe enough)' if zpcs_passed else 'FAIL (Most peers worked anyway)'}")
                else:
                    # No peer data for today — allow to pass to be worker-friendly
                    # Usually means the system hasn't populated data yet, so we don't punish the worker
                    avg_peer_working_pct = 0.0 
                    zpcs_passed = True 
                    print(f"[Engine 2 Gate 2] No peer_activity data for today for worker {worker_id}. ZPCS defaulted to PASS.")

                # --- GATE 3: AEC — Anti-Exploitation Check ---
                # Policy must have started BEFORE the earliest disruption event in this claim
                # earliest_event_start was already collected during Gate 1 loop above
                try:
                    policy_start = datetime.fromisoformat(str(policy['coverage_start_at']).replace('Z', '+00:00'))
                    if not policy_start.tzinfo:
                        policy_start = policy_start.replace(tzinfo=timezone.utc)
                    if earliest_event_start and not earliest_event_start.tzinfo:
                        earliest_event_start = earliest_event_start.replace(tzinfo=timezone.utc)

                    aec_passed = policy_start < earliest_event_start if earliest_event_start else False
                    print(f"[Engine 2 Gate 3] policy_start={policy_start}, event_start={earliest_event_start}, AEC={'PASS' if aec_passed else 'FAIL'}")
                except Exception as e:
                    print(f"[Engine 2 Gate 3] Error parsing dates: {e}")
                    aec_passed = False
                
                expected_daily = policy.get('base_income', policy.get('expected_daily_earnings', 1000))
                floor_amount = policy.get('floor_income', int(expected_daily * 0.5))
                
                claim_status = "pending" if (zpcs_passed and aec_passed) else "rejected"
                
                new_claim = {
                    "policy_id": policy['id'],
                    "disruption_event_ids": disruption_event_ids,
                    "gate1_passed": True,
                    "dvs_passed": True,
                    "gate1_disrupted_affinity": combined_disrupted_affinity,
                    "gate1_remaining_affinity": remaining_affinity,
                    "zpcs_passed": zpcs_passed,
                    "gate2_avg_peer_working_pct": avg_peer_working_pct if total_weight > 0 else 0.0,
                    "aec_passed": aec_passed,
                    "expected_daily": int(expected_daily),
                    "floor_amount": int(floor_amount),
                    "actual_earned": 0,
                    "final_payout": 0,
                    "weekly_cap_remaining": int(expected_daily * 7),
                    "status": claim_status
                }
                supabase.table("claims").insert(new_claim).execute()
                
                if claim_status == "pending":
                    supabase.table("policies").update({"status": "pending"}).eq("id", policy['id']).execute()
                    print(f"[Engine 2] Policy {policy['id']} moved to PENDING due to disruptions in {disrupted_wards}")
                else:
                    print(f"[Engine 2] Policy {policy['id']} failed G2/G3. ZPCS:{zpcs_passed}, AEC:{aec_passed}")

        # -------------------------------------------------------------
        # PHASE 2: PENDING -> LAPSED (Finalize Claim & Payout)
        # -------------------------------------------------------------
        pending_policies = supabase.table("policies").select("id, worker_id").eq("status", "pending").execute()
        
        for policy in pending_policies.data:
            claim_res = supabase.table("claims").select("*").eq("policy_id", policy['id']).eq("status", "pending").execute()
            if not claim_res.data:
                continue
            claim = claim_res.data[0]
            
            # 1. Determine Disruption Wards and Start Time
            disrupted_wards = []
            earliest_start = None
            
            for ev_id in claim.get('disruption_event_ids', []):
                ev_res = supabase.table("zone_disruption_events").select("ward_id, created_at").eq("id", ev_id).execute()
                if ev_res.data:
                    ward = ev_res.data[0].get('ward_id')
                    ev_start = datetime.fromisoformat(str(ev_res.data[0].get('created_at')).replace('Z', '+00:00'))
                    if not ev_start.tzinfo:
                        ev_start = ev_start.replace(tzinfo=timezone.utc)
                    if ward not in disrupted_wards:
                        disrupted_wards.append(ward)
                    if earliest_start is None or ev_start < earliest_start:
                        earliest_start = ev_start
            
            if not disrupted_wards or not earliest_start:
                continue

            # 2. Check if all disrupted wards have resolved
            all_resolved = True
            for ward in disrupted_wards:
                # Check the latest event for this ward
                latest_ev_res = supabase.table("zone_disruption_events").select("is_active").eq("ward_id", ward).lte("created_at", now.isoformat()).order("created_at", desc=True).limit(1).execute()
                if latest_ev_res.data and latest_ev_res.data[0].get('is_active'):
                    all_resolved = False
                    break
                    
            if all_resolved:
                print(f"[Engine 2 Phase 2] Disruption ended for policy {policy['id']}. Evaluating Gate 5...")
                
                # 3. Calculate metrics using Phase 4's Duration Logic
                # Max duration of 24 hours to avoid runaway expected claims if logic breaks
                duration_hours = min(24.0, (now - earliest_start).total_seconds() / 3600.0)
                if duration_hours <= 0:
                    duration_hours = 1.0 # Minimum 1 hour
                
                expected_daily = claim.get('expected_daily', 800)
                floor_amount = claim.get('floor_amount', 0)
                
                # Assume 10 working hours per day. So 1 hour = expected_daily / 10
                expected_period_earnings = expected_daily * (duration_hours / 10.0)
                if expected_period_earnings > expected_daily:
                    expected_period_earnings = expected_daily
                    
                # Fetch actual earned during the exact bounds of the disruption
                worker_id = policy['worker_id']
                start_iso = earliest_start.isoformat()
                end_iso = now.isoformat()
                
                orders_res = supabase.table("worker_orders").select("earning").eq("worker_id", worker_id).gte("created_at", start_iso).lte("created_at", end_iso).execute()
                actual_earned = sum(order.get('earning', 0) for order in orders_res.data) if orders_res.data else 0
                
                print(f"[Engine 2 Phase 2] Duration: {duration_hours:.2f}h, Expected: Rs.{expected_period_earnings:.2f}, Actual: Rs.{actual_earned}")

                # 4. Gate 5 Logic Combined
                GATE5_PERCENTAGE_THRESHOLD = 0.75
                final_payout = 0
                
                # Phase-3 uses 75% limit on the new Phase-4 expected earnings calculation
                if actual_earned >= (GATE5_PERCENTAGE_THRESHOLD * expected_period_earnings):
                    final_claim_status = "rejected"
                    print(f"  -> GATE 5 REJECTED: Worker earned {actual_earned:.2f} which is >= {GATE5_PERCENTAGE_THRESHOLD*100}% of expected {expected_period_earnings:.2f}")
                else:
                    final_claim_status = "approved"
                    # Payout is inversely proportional to earnings: reward effort but cover the gap.
                    gap = expected_period_earnings - actual_earned
                    # Ensure payout is non-negative and capped at expected
                    final_payout = max(0, int(gap))
                    print(f"  -> GATE 5 APPROVED: Worker earned {actual_earned:.2f}. Expected: {expected_period_earnings:.2f}. Gap Payout: {final_payout}")
                
                supabase.table("claims").update({
                    "actual_earned": actual_earned,
                    "final_payout": final_payout,
                    "status": final_claim_status,
                    "paid_at": now.isoformat() if final_claim_status == "approved" else None
                }).eq("id", claim['id']).execute()

                # --- NEW: Automated Payout Recording ---
                if final_claim_status == "approved":
                    supabase.table("payments").insert({
                        "policy_id": policy['id'],
                        "amount": -int(final_payout), # Negative to indicate outflow
                        "status": "success",
                        "transaction_ref": f"payout_claim_{claim['id'][:8]}",
                        "paid_at": now.isoformat()
                    }).execute()
                    print(f"  -> PAYOUT RECORDED: Rs.-{final_payout} in payments table.")
                
                # 5. Update Policy State
                if final_claim_status == "approved":
                    supabase.table("policies").update({
                        "status": "lapsed",
                        "cumulative_weeks_count": 0,
                        "cumulative_amount_collected": 0.0,
                        "next_due_date": None
                    }).eq("id", policy['id']).execute()
                else:
                    # Return to active if rejected (didn't qualify for final payout)
                    supabase.table("policies").update({"status": "active"}).eq("id", policy['id']).execute()

        return {"success": True, "message": "Engine 2 evaluation complete"}
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[Engine 2] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
