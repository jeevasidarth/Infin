import os
import random
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

# Setup Supabase Client
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
if not url or not key:
    raise Exception("Missing SUPABASE_URL or SUPABASE_KEY in .env")

supabase: Client = create_client(url, key)

def generate_data():
    print("Starting smart synthetic data generation...")

    # Fetch workers
    workers_res = supabase.table("workers").select("id, city").execute()
    workers = workers_res.data
    if not workers:
        print("No workers found! Please ensure you have workers in the DB.")
        return
    print(f"Found {len(workers)} workers.")

    # Fetch exiting wards
    wards_res = supabase.table("wards").select("id, name").execute()
    if len(wards_res.data) < 5:
        print("Wards missing. Please re-run the previous sql script to ensure you have 5 wards.")
        return
    
    ward_ids = [w['id'] for w in wards_res.data]

    # Clear old tracking data
    print("Clearing old orders and events...")
    supabase.table("worker_orders").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
    supabase.table("zone_disruption_events").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()

    now = datetime.now(timezone.utc)

    # -------------------------------------------------------------
    # 1. Generate Hourly Zone Disruption Events over 14 days
    # -------------------------------------------------------------
    print("Generating Hourly Zone Disruption Events over 14 days for all Wards...")
    events_data = []

    # Define Disruption Windows
    disruption_windows = {
        ward_ids[0]: {
            "start": now - timedelta(hours=12),
            "end": now + timedelta(days=1), # Also active
            "type": "flood",
            "val": 40.0
        },
        ward_ids[1]: {
            "start": now - timedelta(days=2),
            "end": now - timedelta(days=1),
            "type": "rain",
            "val": 45.0
        },
        ward_ids[2]: {
            "start": now - timedelta(hours=6),
            "end": now + timedelta(days=1), # active until future
            "type": "rain",
            "val": 60.0 # This leads to ~21% working
        }
    }

    inserted_events = []
    
    # Iterate through past 14 days + 7 days into the future
    for day_offset in range(14, -8, -1):
        for hour in range(24):
            entry_time = now - timedelta(days=day_offset)
            entry_time = entry_time.replace(hour=hour, minute=0, second=0, microsecond=0)
            
            for ward_id in ward_ids:
                is_disrupted = False
                rain_val = 0.0
                flood_val = 0.0
                
                if ward_id in disruption_windows:
                    window = disruption_windows[ward_id]
                    if window["start"] <= entry_time <= window["end"]:
                        is_disrupted = True
                        if window["type"] == "rain":
                            rain_val = window["val"] + random.uniform(-5, 5)
                        elif window["type"] == "flood":
                            flood_val = window["val"] + random.uniform(-0.2, 0.2)
                            
                event_dict = {
                    "ward_id": ward_id,
                    "rain": max(0, rain_val),
                    "flood": max(0, flood_val),
                    "aqi": 50.0,
                    "heat": 85.0,
                    "lockdown": False,
                    "strike": False,
                    "is_active": is_disrupted,
                    "created_at": entry_time.isoformat()
                }
                events_data.append(event_dict)
                inserted_events.append(event_dict)

    # Batch insert events
    chunk_size = 500
    for i in range(0, len(events_data), chunk_size):
        chunk = events_data[i:i + chunk_size]
        supabase.table("zone_disruption_events").insert(chunk).execute()
        print(f"Inserted {i + len(chunk)}/{len(events_data)} hourly events...")

    # Helper function to check if a ward is disrupted exactly at trip time
    def is_ward_disrupted(ward_id, trip_time):
        # Find the hour bin for the trip_time
        target_hour = trip_time.replace(minute=0, second=0, microsecond=0)
        
        # We can just check our local inserted_events directly
        for e in inserted_events:
            if e['ward_id'] == ward_id:
                dt_str = str(e['created_at']).replace('Z', '+00:00')
                if '+' not in dt_str and '-' not in dt_str.split('T')[1]:
                    dt_str += '+00:00'
                event_hour = datetime.fromisoformat(dt_str)
                if not event_hour.tzinfo:
                    event_hour = event_hour.replace(tzinfo=timezone.utc)
                    
                if target_hour == event_hour:
                    return e['is_active']
                    
        return False

    # -------------------------------------------------------------
    # 2. Generate 14-day worker_orders history accounting for disruptions
    # -------------------------------------------------------------
    print("Generating worker_orders history accounting for hourly disruptions (14 days past + 7 days future)...")
    orders_to_insert = []

    for worker in workers:
        # Give each worker realistic "home" wards to create clustered affinity footprints
        home_wards = random.sample(ward_ids, random.randint(1, 2))

        for day_offset in range(14, -8, -1):
            day_ts = now - timedelta(days=day_offset)
            num_trips_today = random.randint(1, 5)
            
            for _ in range(num_trips_today):
                trip_time = day_ts - timedelta(hours=random.randint(0, 10), minutes=random.randint(0, 59))
                
                # 85% of trips happen in their primary home wards to build realistic affinity
                if random.random() < 0.85:
                    pickup = random.choice(home_wards)
                    drop = random.choice(home_wards)
                else:
                    pickup = random.choice(ward_ids)
                    drop = random.choice(ward_ids)
                
                pickup_disrupted = is_ward_disrupted(pickup, trip_time)
                drop_disrupted = is_ward_disrupted(drop, trip_time)
                
                if (pickup_disrupted or drop_disrupted) and random.random() < 0.8:
                    continue  # Skip generating this order
                
                possible_intermediates = [w for w in ward_ids if w not in (pickup, drop)]
                num_intermediates = random.randint(0, min(2, len(possible_intermediates)))
                intermediates = random.sample(possible_intermediates, num_intermediates) if possible_intermediates else []
                
                intermediates = [w for w in intermediates if not (is_ward_disrupted(w, trip_time) and random.random() < 0.7)]

                earning = random.randint(50, 250)
                duration = random.randint(15, 60)
                if pickup_disrupted or drop_disrupted:
                    earning = int(earning * 1.5)  
                    duration = int(duration * 1.5) 

                orders_to_insert.append({
                    "worker_id": worker['id'],
                    "pickup_ward_id": pickup,
                    "drop_ward_id": drop,
                    "intermediate_wards_ids": intermediates,
                    "earning": earning,
                    "duration_minutes": duration,
                    "created_at": trip_time.isoformat()
                })

    # Batch insert orders
    for i in range(0, len(orders_to_insert), chunk_size):
        chunk = orders_to_insert[i:i + chunk_size]
        supabase.table("worker_orders").insert(chunk).execute()
        print(f"Inserted {i + len(chunk)}/{len(orders_to_insert)} disrupted-aware orders...")

    # -------------------------------------------------------------
    # 3. Generate Peer Activity Data per Ward per Day (Gate 2 baseline)
    # -------------------------------------------------------------
    print("Generating peer_activity data for Gate 2 (14 days past + 7 days future)...")

    # Clear old peer_activity
    supabase.table("peer_activity").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()

    peer_data = []
    total_workers = len(workers)

    for day_offset in range(14, -8, -1):
        entry_day = now - timedelta(days=day_offset)
        entry_date = entry_day.date()

        for ward_id in ward_ids:
            # Check if this ward is disrupted on this specific day
            ward_disrupted_today = False
            if ward_id in disruption_windows:
                window = disruption_windows[ward_id]
                day_start = entry_day.replace(hour=0, minute=0, second=0, microsecond=0)
                day_end = entry_day.replace(hour=23, minute=59, second=59, microsecond=0)
                if window["start"] <= day_start <= window["end"] or window["start"] <= day_end <= window["end"]:
                    ward_disrupted_today = True

            if ward_disrupted_today:
                # During disruption: Only 5-30% of workers continue working despite it
                percent_working = round(random.uniform(0.05, 0.30), 3)
            else:
                # Normal day: 85-98% of workers are active/working
                percent_working = round(random.uniform(0.85, 0.98), 3)

            working_workers = int(total_workers * percent_working)

            peer_data.append({
                "ward_id": ward_id,
                "total_workers": total_workers,
                "affected_workers": total_workers - working_workers, # This now tracks stopped workers
                "percent_working": percent_working,
                "date": entry_date.isoformat(),
                "created_at": entry_day.isoformat()
            })

    for i in range(0, len(peer_data), chunk_size):
        chunk = peer_data[i:i + chunk_size]
        supabase.table("peer_activity").insert(chunk).execute()
        print(f"Inserted {i + len(chunk)}/{len(peer_data)} peer activity records...")

    print("✅ Smart synthetic data generation complete!")

if __name__ == "__main__":
    generate_data()
