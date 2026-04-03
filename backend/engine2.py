from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta
from typing import Optional

router = APIRouter()

@router.post("/api/v1/engine/evaluate")
async def evaluate_claims(simulated_time: Optional[str] = Query(None, description="ISO datetime string to simulate fast-forwarding (e.g. 2026-03-21T14:00:00)")):
    """
    Hourly cron endpoint for Engine 2 validation.
    Phase 1: Active -> Pending (Initiate Claim)
    Phase 2: Pending -> Lapsed (Finalize Claim & Payout)
    """
    # Import supabase from main
    from main import supabase
    if not supabase:
        raise HTTPException(status_code=500, detail="Database connection error")
        
    try:
        if simulated_time:
            # Fast-forward time for testing synthetic data
            now = datetime.fromisoformat(simulated_time.replace('Z', '+00:00'))
            if not now.tzinfo:
                now = now.replace(tzinfo=timezone.utc)
        else:
            now = datetime.now(timezone.utc)
        
        # 0. Fetch threshold values
        thresh_res = supabase.table("threshold_values").select("*").execute()
        thresholds = {row['factor']: row['threshold_value'] for row in thresh_res.data} if thresh_res.data else {}
        
        # Default safety thresholds just in case DB is missing them
        T_RAIN = thresholds.get('rain', 20.0)
        T_FLOOD = thresholds.get('flood', 1.0)
        T_AQI = thresholds.get('aqi', 300.0)
        T_HEAT = thresholds.get('heat', 105.0)  # Changed to 105.0 assuming Farenheit data
        T_ZPCS = thresholds.get('zpcs', 35.0)

        # Helper to evaluate DVS
        def evaluate_dvs(event):
            if not event:
                return False
            rain = event.get('rain', 0)
            flood = event.get('flood', 0)
            aqi = event.get('aqi', 0)
            heat = event.get('heat', 0)
            lockdown = event.get('lockdown', False)
            strike = event.get('strike', False)
            
            return (
                rain >= T_RAIN or
                flood >= T_FLOOD or
                aqi >= T_AQI or
                heat >= T_HEAT or
                lockdown or strike
            )

        # -------------------------------------------------------------
        # PHASE 1: ACTIVE -> PENDING (Initiate Claim Tracking)
        # -------------------------------------------------------------
        active_policies = supabase.table("policies").select("id, worker_id, coverage_start_at, expected_daily_earnings").eq("status", "active").execute()
        
        for policy in active_policies.data:
            worker_id = policy['worker_id']
            worker_res = supabase.table("workers").select("pin_code").eq("id", worker_id).execute()
            if not worker_res.data:
                continue
            pin_code = worker_res.data[0]['pin_code']
            
            # Fetch latest disruption for pincode UP TO CURRENT TIME (ignore future synthetic data)
            event_res = supabase.table("zone_disruption_events").select("*").eq("pin_code", pin_code).lte("created_at", now.isoformat()).order("created_at", desc=True).limit(1).execute()
            if not event_res.data:
                continue
            event = event_res.data[0]
            
            dvs_passed = evaluate_dvs(event)
            
            if dvs_passed:
                existing_claim = supabase.table("claims").select("id").eq("policy_id", policy['id']).eq("event_id", event['id']).execute()
                if existing_claim.data:
                    print(f"[Engine 2 Phase 1] Skipping policy {policy['id']} for event {event['id']} - Claim already exists.")
                    continue
                    
                # Evaluate Gate 2: ZPCS UP TO CURRENT TIME
                peer_res = supabase.table("peer_activity").select("*").eq("pin_code", pin_code).lte("created_at", now.isoformat()).order("created_at", desc=True).limit(1).execute()
                zpcs_passed = False
                if peer_res.data:
                    peer = peer_res.data[0]
                    zpcs_passed = (peer.get('percent_affected') or 0.0) >= T_ZPCS

                # Evaluate Gate 3: AEC 
                try:
                    policy_start = datetime.fromisoformat(str(policy['coverage_start_at']).replace('Z', '+00:00'))
                    event_time = datetime.fromisoformat(str(event['created_at']).replace('Z', '+00:00'))
                    aec_passed = policy_start < event_time
                except Exception:
                    aec_passed = False
                
                expected_daily = policy['expected_daily_earnings']
                floor_amount = int(expected_daily * 0.5)

                claim_status = "pending" if (dvs_passed and zpcs_passed and aec_passed) else "rejected"

                new_claim = {
                    "policy_id": policy['id'],
                    "event_id": event['id'],
                    "dvs_passed": dvs_passed,
                    "zpcs_passed": zpcs_passed,
                    "aec_passed": aec_passed,
                    "expected_daily": expected_daily,
                    "floor_amount": floor_amount,
                    "actual_earned": 0,
                    "final_payout": 0,
                    "status": claim_status
                }
                supabase.table("claims").insert(new_claim).execute()
                
                if claim_status == "pending":
                    supabase.table("policies").update({"status": "pending"}).eq("id", policy['id']).execute()
                    print(f"[Engine 2] Policy {policy['id']} moved to PENDING due to event {event['id']}")
                else:
                    print(f"[Engine 2] Policy {policy['id']} tracked failed claim. ZPCS:{zpcs_passed}, AEC:{aec_passed}")

        # -------------------------------------------------------------
        # PHASE 2: PENDING -> LAPSED (Finalize Claim & Payout)
        # -------------------------------------------------------------
        pending_policies = supabase.table("policies").select("id, worker_id").eq("status", "pending").execute()
        print(f"[Engine 2] Found {len(pending_policies.data)} pending policies to evaluate.")
        
        for policy in pending_policies.data:
            print(f"[Engine 2 Phase 2] Evaluating pending policy {policy['id']}")
            claim_res = supabase.table("claims").select("*").eq("policy_id", policy['id']).eq("status", "pending").execute()
            if not claim_res.data:
                print(f"[Engine 2 Phase 2] Skipping: No pending claim found for policy {policy['id']}")
                continue
            claim = claim_res.data[0]
            
            worker_res = supabase.table("workers").select("pin_code").eq("id", policy['worker_id']).execute()
            if not worker_res.data: 
                print(f"[Engine 2 Phase 2] Skipping: No worker found for {policy['worker_id']}")
                continue
            pin_code = worker_res.data[0]['pin_code']
            
            # Check if disruption has ended AS OF CURRENT TIME
            event_res = supabase.table("zone_disruption_events").select("*").eq("pin_code", pin_code).lte("created_at", now.isoformat()).order("created_at", desc=True).limit(1).execute()
            
            disruption_ended = True 
            if event_res.data:
                latest_event = event_res.data[0]
                dvs_still_active = evaluate_dvs(latest_event)
                print(f"[Engine 2 Phase 2] Pincode {pin_code} latest event {latest_event['id']} DVS passing: {dvs_still_active}")
                if dvs_still_active:
                    disruption_ended = False
            else:
                print(f"[Engine 2 Phase 2] No events found for {pin_code} up to this time.")
            
            if disruption_ended:
                print(f"[Engine 2 Phase 2] Disruption ended for policy {policy['id']}. Finalizing payout.")
                trigger_res = supabase.table("zone_disruption_events").select("created_at").eq("id", claim['event_id']).execute()
                if not trigger_res.data:
                    print(f"[Engine 2 Phase 2] Skipping: Original trigger event {claim['event_id']} not found.")
                    continue
                event_date_str = trigger_res.data[0]['created_at'][:10]
                
                # Fetch max cumulative earnings for that specific date UP TO CURRENT TIME
                earnings_res = supabase.table("earnings_history").select("earnings").eq("worker_id", policy['worker_id']).eq("date", event_date_str).lte("ts", now.isoformat()).order("ts", desc=True).limit(1).execute()
                
                actual_earned = 0
                if earnings_res.data:
                    actual_earned = earnings_res.data[0]['earnings']
                else:
                    print(f"[Engine 2 Phase 2] Warning: No earnings history found for {policy['worker_id']} on {event_date_str}.")
                
                expected_daily = claim['expected_daily']
                final_payout = 0
                
                if actual_earned > (0.5 * expected_daily):
                    final_claim_status = "rejected"
                    print(f"[Engine 2 Phase 2] Policy {policy['id']} payout rejected: actual({actual_earned}) > 50% of expected({expected_daily})")
                else:
                    final_claim_status = "approved"
                    final_payout = int(expected_daily - actual_earned)
                    if final_payout < 0:
                        final_payout = 0
                    print(f"[Engine 2 Phase 2] Policy {policy['id']} approved payout: ₹{final_payout} (Earned: {actual_earned}, Expected: {expected_daily})")
                
                # Perform the updates
                supabase.table("claims").update({
                    "actual_earned": actual_earned,
                    "final_payout": final_payout,
                    "status": final_claim_status,
                    "paid_at": now.isoformat() if final_claim_status == "approved" else None
                }).eq("id", claim['id']).execute()
                               # Status Reversion & Rollover Logic
                new_status = "active" # Default back to active if rejected
                new_weeks = 0 
                new_amount = 0.0
                new_due = None
                
                curr_policy_res = supabase.table("policies").select("*").eq("id", policy['id']).execute()
                if curr_policy_res.data:
                    curr_policy = curr_policy_res.data[0]
                    new_weeks = curr_policy.get('cumulative_weeks_count', 1)
                    new_amount = curr_policy.get('cumulative_amount_collected', 0.0)
                    new_due = curr_policy.get('next_due_date')

                    if final_claim_status == "approved":
                        # If they pre-paid for >1 week, consume current week and roll over
                        if new_weeks > 1:
                            new_status = "active"
                            new_weeks = 1 # Streak resets upon approved payout
                            
                            # Adjust collected amount by removing one week's cost
                            weekly_cost = curr_policy.get('policy_cost', 0)
                            new_amount = float((new_weeks) * weekly_cost)
                            
                            # Next week starts NOW, so reset the next_due_date to 7 days from now
                            next_due_dt = now + timedelta(days=7)
                            new_due = next_due_dt.isoformat()
                            print(f"[Engine 2 Phase 2] Approved Payout - Rolling over to week 1. New Due: {new_due}")
                        else:
                            # Last week consumed and claimed -> Lapse
                            new_status = "lapsed"
                            new_weeks = 0
                            new_amount = 0.0
                            new_due = None
                            print(f"[Engine 2 Phase 2] Approved Payout - Final week consumed. Policy LAPSED.")
                    else:
                        # Rejected Claim -> Simply revert status to active to continue current term
                        new_status = "active"
                        print(f"[Engine 2 Phase 2] Claim Rejected - Reverting status to ACTIVE for current term.")

                update_data = {
                    "status": new_status,
                    "cumulative_weeks_count": new_weeks,
                    "cumulative_amount_collected": new_amount,
                    "next_due_date": new_due
                }
                supabase.table("policies").update(update_data).eq("id", policy['id']).execute()
                print(f"[Engine 2 Phase 2] Successfully applied post-claim state ({new_status}) for policy {policy['id']}")
            else:
                print(f"[Engine 2 Phase 2] Waiting... Policy {policy['id']} stays pending because disruption is still active.")

        # -------------------------------------------------------------
        # PHASE 3: NATURAL EXPIRATION (Time-based Lapse)
        # -------------------------------------------------------------
        # Scan active policies that have passed their next_due_date
        expired_res = supabase.table("policies").select("*").eq("status", "active").lte("next_due_date", now.isoformat()).execute()
        
        for p in expired_res.data:
            # If they had multiple weeks, we should have processed rollover in Phase 0 but 
            # for now, the simplest is to lapse them if the final deadline is hit.
            supabase.table("policies").update({
                "status": "lapsed",
                "cumulative_weeks_count": 0,
                "cumulative_amount_collected": 0.0
            }).eq("id", p['id']).execute()
            print(f"[Engine 2 Phase 3] Policy {p['id']} lapsed naturally due to time.")

        return {"success": True, "message": "Engine 2 evaluation complete"}
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[Engine 2] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
