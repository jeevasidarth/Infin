import os
import asyncio
from dotenv import load_dotenv
from supabase import create_client
from main import evaluate_weather_for_disruption

load_dotenv()
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
supabase = create_client(url, key)

async def test_disruption_trigger():
    print("Testing Automated Disruption Trigger...")
    
    # 1. Mock a severe weather reading for Chennai
    mock_weather = {
        "city": "Chennai",
        "rain_mm": 35.0, # Exceeds THRESHOLDS['heavy_rain_mm'] = 25.0
        "temperature_c": 28.0,
        "condition": "Heavy rain"
    }

    # 2. Run the evaluation
    # This should find the Chennai proxy ward and trigger a disruption
    from main import supabase as main_supabase
    import main
    main.supabase = supabase # Inject client
    
    await evaluate_weather_for_disruption(mock_weather)
    
    # 3. Verify in DB
    # Fetch wards for Chennai
    wards = supabase.table("wards").select("id").ilike("city", "%Chennai%").execute()
    ward_ids = [w['id'] for w in wards.data]
    
    if ward_ids:
        active_disruption = supabase.table("zone_disruption_events") \
            .select("*") \
            .in_("ward_id", ward_ids) \
            .eq("is_active", True) \
            .order("created_at", desc=True) \
            .limit(1).execute()
        
        if active_disruption.data:
            print(f"SUCCESS: Automated disruption triggered for Chennai ward {active_disruption.data[0]['ward_id']}")
            print(f"Details: Rain={active_disruption.data[0]['rain']}mm")
        else:
            print("FAILED: No active disruption found for Chennai.")
    else:
        print("FAILED: No wards found for Chennai in DB.")

if __name__ == "__main__":
    asyncio.run(test_disruption_trigger())
