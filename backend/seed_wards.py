import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
supabase = create_client(url, key)

NEW_CITIES = ["Chennai", "Bangalore", "Hyderabad", "Delhi"]

def seed_proxy_wards():
    print("Seeding proxy wards for new cities...")
    
    wards = []
    for city in NEW_CITIES:
        # Check if any ward exists for this city
        res = supabase.table("wards").select("id").ilike("city", f"%{city}%").limit(1).execute()
        if not res.data:
            wards.append({
                "name": f"{city} Center Ward",
                "city": city,
                "boundary_info": "{}" # Placeholder JSON
            })
            print(f"Adding proxy ward for {city}")
        else:
            print(f"Ward already exists for {city}")

    if wards:
        supabase.table("wards").insert(wards).execute()
        print(f"Successfully added {len(wards)} wards.")
    else:
        print("No new wards added.")

if __name__ == "__main__":
    seed_proxy_wards()
