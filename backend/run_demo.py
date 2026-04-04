import os
import asyncio
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv

load_dotenv()

# We set up supabase globally similar to trigger_engine2.py
from supabase import create_client
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
client = create_client(url, key)

import main
main.supabase = client

from engine2 import evaluate_claims

async def run_demo():
    print("="*60)
    print("INFIN - AUTOMATED CLAIM VALIDATION DEMO (END-TO-END)")
    print("="*60)
    
    # 1. Prepare target user and policy
    user_res = client.table('workers').select('id, email').limit(1).execute()
    if not user_res.data:
        print("No workers found. Please run the app/signup to create one.")
        return
    
    worker = user_res.data[0]
    worker_id = worker['id']
    worker_email = worker.get('email', 'Unknown Email')
    print(f"\n[Setup] Selected Worker: {worker_email} ({worker_id})")
    
    # Ensure they have an active policy that started WELL BEFORE any disruption
    now = datetime.now(timezone.utc)
    backdated_start = (now - timedelta(days=7)).isoformat()
    
    policy_res = client.table('policies').select('id, status').eq('worker_id', worker_id).execute()
    if policy_res.data:
        policy = policy_res.data[0]
        client.table('policies').update({
            'status': 'active',
            'coverage_start_at': backdated_start,
            'cumulative_weeks_count': 3, # Mock some progress
            'cumulative_amount_collected': 150.0
        }).eq('id', policy['id']).execute()
        print(f"[Setup] Backdated existing policy {policy['id']} to 7 days ago to ensure Gate 3 (AEC) passes.")
    else:
        # Create a proxy active policy if they don't have one
        pol = {
            'worker_id': worker_id,
            'status': 'active',
            'coverage_start_at': backdated_start,
            'expected_daily_earnings': 1000,
            'policy_cost': 50,
            'cumulative_weeks_count': 3,
            'cumulative_amount_collected': 150.0
        }
        res = client.table('policies').insert(pol).execute()
        print(f"[Setup] Created mock policy {res.data[0]['id']} with backdated start.")
        
    policy = client.table('policies').select('id').eq('worker_id', worker_id).execute().data[0]
    
    # Clear any existing claims for a fresh trace
    client.table('claims').delete().eq('policy_id', policy['id']).execute()
    
    # 2. Pick a high-affinity ward to trigger the disruption
    # We will compute affinity manually fast or pick a ward from worker_orders
    orders_res = client.table('worker_orders').select('pickup_ward_id').eq('worker_id', worker_id).limit(10).execute()
    if not orders_res.data:
        # Generate a dummy order to fetch a ward id
        print("[Setup] No existing orders found, generating a dummy order...")
        wards = client.table('wards').select('id').limit(1).execute()
        ward_id = wards.data[0]['id']
        client.table('worker_orders').insert({
            'worker_id': worker_id,
            'pickup_ward_id': ward_id,
            'earning': 200,
            'duration_minutes': 45,
            'created_at': (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
        }).execute()
    else:
        ward_id = orders_res.data[0]['pickup_ward_id']
        
    print(f"[Setup] Targeting ward ID: {ward_id} for disruption.")
    
    # 2. Pick all wards the worker has affinity with to manage disruptions cleanly
    affinity_res = client.table('worker_ward_affinity').select('ward_id').eq('worker_id', worker_id).execute()
    ward_ids = [a['ward_id'] for a in affinity_res.data] if affinity_res.data else [ward_id]
    
    print(f"[Setup] Clearing existing active disruptions for worker wards: {ward_ids}")
    client.table('zone_disruption_events').update({'is_active': False}).in_('ward_id', ward_ids).execute()

    # 3. Create an ACTIVE disruption right now for the primary ward
    now = datetime.now(timezone.utc)
    disruption_start = now - timedelta(hours=4) # Started 4 hours ago
    
    client.table('zone_disruption_events').insert({
        'ward_id': ward_ids[0],
        'is_active': True,
        'rain': 85.0,
        'flood': 0.0,
        'aqi': 50.0,
        'heat': 80.0,
        'lockdown': False,
        'strike': False,
        'created_at': disruption_start.isoformat()
    }).execute()
    
    # Ensure Gate 2 passes (less than 50% working)
    today = now.date().isoformat()
    client.table('peer_activity').upsert({
        'ward_id': ward_ids[0],
        'date': today,
        'percent_working': 0.15 # Severe rain, only 15% working
    }).execute()
    print(f"[Setup] Injected Active disruption event (Rain > 80mm) in {ward_ids[0]} starting at {disruption_start.isoformat()}")
    print("-" * 60)
    
    # --- STEP A: Trigger Phase 1 Evaluator ---
    print("\n[EVALUATION TICK 1] Disruption is ONGOING")
    await evaluate_claims(now.isoformat())
    
    claim_check = client.table('claims').select('id, status, disruption_event_ids').eq('policy_id', policy['id']).execute()
    if not claim_check.data:
        print("-> Evaluation Tick 1 Failed: No claim was created.")
        return
        
    claim = claim_check.data[0]
    claim_status = claim['status']
    print(f"\n-> Evaluation Tick 1 Complete. Claim {claim['id']} Status: {claim_status}")
    print("-" * 60)
    
    # --- STEP B: Resolve ALL wards tied to this claim ---
    # To pass Phase 2's 'all_resolved' check, every ward in the claim must have is_active=False
    event_ids = claim.get('disruption_event_ids', [])
    if event_ids:
        client.table('zone_disruption_events').update({'is_active': False}).in_('id', event_ids).execute()
        print(f"\n[Setup] Resolved {len(event_ids)} disruption events tied to the claim.")
    else:
        # Fallback to resolving the affinity wards
        client.table('zone_disruption_events').update({'is_active': False}).in_('ward_id', ward_ids).execute()
        print(f"\n[Setup] Resolved all affinity wards.")
        
    print("-" * 60)
    
    # --- STEP C: Trigger Phase 2 Evaluator ---
    print("\n[EVALUATION TICK 2] Post-Disruption Resolution")
    # Simulate being 1 minute later
    await evaluate_claims((now + timedelta(minutes=1)).isoformat())
    
    claim_check = client.table('claims').select('*').eq('policy_id', policy['id']).execute()
    if claim_check.data:
        c = claim_check.data[0]
        print("\n" + "="*60)
        print("FINAL GATE 5 CLAIM REPORT")
        print("="*60)
        print(f"Gate 1 Passed: {c['gate1_passed']}")
        print(f"Gate 2 Passed: {c['zpcs_passed']} (Peer working: {c['gate2_avg_peer_working_pct']*100:.1f}%)")
        print(f"Gate 3 Passed: {c['aec_passed']}")
        print(f"\nGate 5 Final Variables:")
        print(f"   - Expected Disruption Earnings: Dynamically calculated based on duration")
        print(f"   - Actual Earned during Window : Rs.{c['actual_earned']}")
        print(f"   - Final Payout Calculated     : Rs.{c['final_payout']}")
        print(f"   - CLAIM STATUS                : {c['status']}")
        print("="*60)

if __name__ == "__main__":
    try:
        asyncio.run(run_demo())
    except Exception as e:
        print("EXCEPTION CAUGHT IN DEMO LOOP:")
        print(repr(e))
        if hasattr(e, 'message'):
            print("Message:", e.message)
        if hasattr(e, 'details'):
            print("Details:", e.details)
