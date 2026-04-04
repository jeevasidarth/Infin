import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(url, key)

def reset_db():
    print("Clearing backend-generated data...")
    # Delete child dependencies first
    supabase.table("claims").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
    supabase.table("payments").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
    supabase.table("loyalty_settlements").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
    supabase.table("worker_ward_affinity").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
    
    # Delete all policies -> users will be forced to enroll
    print("Clearing policies...")
    supabase.table("policies").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
    
    # Update workers to Mumbai
    print("Updating workers to Mumbai...")
    supabase.table("workers").update({"city": "Mumbai"}).neq("id", "00000000-0000-0000-0000-000000000000").execute()
    
    # Also elegantly update the existing wards so it looks native
    wards = supabase.table("wards").select("id, name").execute().data
    if wards:
        for w in wards:
            new_name = w['name'].replace("Chennai", "Mumbai").replace("Delhi", "Mumbai").replace("Bangalore", "Mumbai")
            if "Mumbai" not in new_name:
                # If it already had no city name attached, just append it.
                if "-" not in new_name:
                    new_name = f"{new_name} - Mumbai"
            supabase.table("wards").update({"city": "Mumbai", "name": new_name}).eq("id", w['id']).execute()
            
    print("Database State Reset complete! All workers must now enroll.")

if __name__ == "__main__":
    reset_db()
