import os
import uuid
import random
from datetime import datetime, timedelta
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(url, key)

PINCODES = ['110001', '400001', '560001', '600001', '700001']
START_DATE = datetime(2026, 3, 20, 0, 0, 0)
DAYS = 3 # Generates data for Mar 20, Mar 21, and Mar 22

def generate_correlated_data():
    print("Fetching workers...")
    workers_res = supabase.table("workers").select("id, pin_code").execute()
    workers = workers_res.data
    if not workers:
        print("Error: No workers found in the database. Please add a worker first.")
        return

    # Track cumulative earnings for each worker for the current day
    # Reset at midnight
    daily_earnings = {w['id']: 0 for w in workers}
    daily_deliveries = {w['id']: 0 for w in workers}

    events = []
    peers = []
    earnings = []

    print(f"Generating {DAYS} days of correlated hourly data...")
    
    current_time = START_DATE
    end_time = START_DATE + timedelta(days=DAYS)

    while current_time < end_time:
        hour = current_time.hour
        date_str = current_time.strftime("%Y-%m-%d")
        ts_str = current_time.isoformat()

        # Reset cumulative tracking at midnight
        if hour == 0:
            daily_earnings = {w['id']: 0 for w in workers}
            daily_deliveries = {w['id']: 0 for w in workers}

        # Define disruption logic: Severe storm hits ALL zones on March 21st AND 22nd between 10 AM and 6 PM
        is_disruption = False
        if (current_time.day == 21 or current_time.day == 22) and 10 <= hour <= 18:
            is_disruption = True

        for pin in PINCODES:
            # 1. Generate Zone Disruption Events
            rain_val = random.uniform(25.0, 50.0) if is_disruption else random.uniform(0.0, 5.0)
            flood_val = random.uniform(1.5, 3.0) if is_disruption else 0.0
            
            event = {
                "id": str(uuid.uuid4()),
                "pin_code": pin,
                "rain": round(rain_val, 2),
                "flood": round(flood_val, 2),
                "aqi": random.uniform(50, 100),
                "heat": random.uniform(25, 32),
                "lockdown": False,
                "strike": False,
                "created_at": ts_str
            }
            events.append(event)

            # 2. Generate Peer Activity
            # During disruption, 80-95% are affected. Normally, 2-10% are off.
            pct_affected = random.uniform(80.0, 95.0) if is_disruption else random.uniform(2.0, 10.0)
            
            peer = {
                "id": str(uuid.uuid4()),
                "pin_code": pin,
                "total_workers": random.randint(100, 200),
                "affected_workers": random.randint(80, 150) if is_disruption else random.randint(2, 10),
                "percent_affected": round(pct_affected, 2),
                "created_at": ts_str
            }
            peers.append(peer)

        # 3. Generate Earnings History for each worker
        for worker in workers:
            w_pin = worker['pin_code']
            
            # Since earnings are cumulative, add incrementally each hour
            # Normal hours (8am - 10pm) a worker earns 50-100 per hour. 
            # Night hours (mostly 0).
            # Disrupted hours: almost 0 earnings.
            
            if 8 <= hour <= 22:
                if is_disruption:
                    # Trapped by rain, very little to no earnings
                    earned_this_hour = random.randint(0, 10)
                    deliveries_this_hour = 0
                else:
                    # Normal working hour
                    earned_this_hour = random.randint(50, 100)
                    deliveries_this_hour = random.randint(1, 3)
            else:
                # Nighttime, not working
                earned_this_hour = 0
                deliveries_this_hour = 0

            daily_earnings[worker['id']] += earned_this_hour
            daily_deliveries[worker['id']] += deliveries_this_hour

            earning_record = {
                "id": str(uuid.uuid4()),
                "worker_id": worker['id'],
                "date": date_str,
                "earnings": daily_earnings[worker['id']],
                "deliveries": daily_deliveries[worker['id']],
                "ts": ts_str,
                "created_at": ts_str
            }
            earnings.append(earning_record)

        current_time += timedelta(hours=1)

    print("Clearing old data for a clean slate...")
    try:
        # Delete old rows to ensure only the correlated data remains
        # Using a wide filter (gt '') to target all rows if truncate isn't available
        supabase.table("claims").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
        supabase.table("zone_disruption_events").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
        supabase.table("peer_activity").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
        supabase.table("earnings_history").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
        print("Old data cleared successfully.")
    except Exception as e:
        print(f"Warning: Could not clear some tables (likely due to active claims). Please delete claims manually. Error: {e}")

    print("Inserting Zone Disruption Events...")
    for i in range(0, len(events), 500):
        supabase.table("zone_disruption_events").insert(events[i:i+500]).execute()
        
    print("Inserting Peer Activity...")
    for i in range(0, len(peers), 500):
        supabase.table("peer_activity").insert(peers[i:i+500]).execute()
        
    print("Inserting Earnings History...")
    for i in range(0, len(earnings), 500):
        supabase.table("earnings_history").insert(earnings[i:i+500]).execute()

    print("✅ All synthetic data successfully inserted!")
    print("-> March 20th: Normal Day (~800/day earnings)")
    print("-> March 21st: HEAVY RAIN from 10:00 to 18:00 (Earnings plateau, peers highly affected)")
    print("-> March 22nd: Normal Day (~800/day earnings)")

if __name__ == "__main__":
    generate_correlated_data()
