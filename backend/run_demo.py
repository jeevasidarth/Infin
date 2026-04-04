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
    
    # Ensure they have an active policy
    policy_res = client.table('policies').select('id, status').eq('worker_id', worker_id).execute()
    if policy_res.data:
        policy = policy_res.data[0]
        if policy['status'] != 'active':
             client.table('policies').update({'status': 'active'}).eq('id', policy['id']).execute()
             print(f"[Setup] Updated policy {policy['id']} to 'active'.")
    else:
        # Create a proxy active policy if they don't have one
        now = datetime.now(timezone.utc)
        pol = {
            'worker_id': worker_id,
            'status': 'active',
            'coverage_start_at': (now - timedelta(days=5)).isoformat(),
            'expected_daily_earnings': 1000,
            'policy_cost': 50,
            'cumulative_weeks_count': 1,
            'cumulative_amount_collected': 50
        }
        res = client.table('policies').insert(pol).execute()
        print(f"[Setup] Created mock policy {res.data[0]['id']} with status 'active'.")
        
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
    
    # 3. Create an ACTIVE disruption right now
    now = datetime.now(timezone.utc)
    disruption_start = now - timedelta(hours=4) # Started 4 hours ago
    
    client.table('zone_disruption_events').insert({
        'ward_id': ward_id,
        'is_active': True,
        'rain': 80.0,
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
        'ward_id': ward_id,
        'date': today,
        'percent_working': 0.15 # Severe rain, only 15% working
    }).execute()
    print(f"[Setup] Injected Active disruption event (Rain > 80mm) starting at {disruption_start.isoformat()}")
    print("-" * 60)
    
    # --- STEP A: Trigger Phase 1 Evaluator ---
    print("\n[EVALUATION TICK 1] Disruption is ONGOING")
    await evaluate_claims(now.isoformat())
    
    claim_check = client.table('claims').select('status').eq('policy_id', policy['id']).execute()
    claim_status = claim_check.data[0]['status'] if claim_check.data else 'Not Found'
    print(f"\n-> Evaluation Tick 1 Complete. Claim created, Current Status: {claim_status}")
    print("-" * 60)
    
    # --- STEP B: Turn off disruption ---
    client.table('zone_disruption_events').update({'is_active': False}).eq('ward_id', ward_id).execute()
    print("\n[Setup] Disruption explicitly marked as RESOLVED (is_active = False)")
    print("-" * 60)
    
    # --- STEP C: Trigger Phase 2 Evaluator ---
    print("\n[EVALUATION TICK 2] Post-Disruption Resolution")
    # Tell the system we are 4 hours later exactly 
    simulated_now = now.isoformat()
    await evaluate_claims(simulated_now)
    
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
