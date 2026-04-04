"""
One-shot script to seed worker_ward_affinity from existing worker_orders.
This powers Engine 1's DP calculation and should be run once after data generation.
"""
import os
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
s = create_client(os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_KEY"))

def seed_affinity():
    now = datetime.now(timezone.utc)
    fourteen_days_ago = now - timedelta(days=14)

    workers_res = s.table("workers").select("id").execute()
    workers = workers_res.data
    print(f"Seeding affinity for {len(workers)} workers...")

    for worker in workers:
        worker_id = worker["id"]

        orders_res = s.table("worker_orders").select(
            "pickup_ward_id, drop_ward_id, intermediate_wards_ids, earning, duration_minutes"
        ).eq("worker_id", worker_id).gte("created_at", fourteen_days_ago.isoformat()).execute()
        orders = orders_res.data

        if not orders:
            continue

        ward_earnings = {}
        ward_time = {}
        total_earnings = 0
        total_time = 0

        for o in orders:
            pickup = o.get("pickup_ward_id")
            drop = o.get("drop_ward_id")
            inter = o.get("intermediate_wards_ids") or []
            earning = o.get("earning", 0)
            duration = o.get("duration_minutes", 0)

            if pickup:
                ward_earnings[pickup] = ward_earnings.get(pickup, 0) + (earning * 0.43)
            if drop:
                ward_earnings[drop] = ward_earnings.get(drop, 0) + (earning * 0.37)
            if inter:
                inter_split = (earning * 0.20) / len(inter)
                for w in inter:
                    ward_earnings[w] = ward_earnings.get(w, 0) + inter_split

            total_earnings += earning

            route_wards = list(set(filter(None, [pickup, drop] + list(inter))))
            if route_wards:
                time_split = duration / len(route_wards)
                for w in route_wards:
                    ward_time[w] = ward_time.get(w, 0) + time_split
                total_time += duration

        if not total_earnings or not total_time:
            continue

        all_wards = set(list(ward_earnings.keys()) + list(ward_time.keys()))
        affinities = {}
        for w in all_wards:
            e_norm = ward_earnings.get(w, 0) / total_earnings
            t_norm = ward_time.get(w, 0) / total_time
            affinity = (0.72 * e_norm) + (0.28 * t_norm)
            if affinity >= 0.05:
                affinities[w] = round(affinity, 6)

        if not affinities:
            continue

        # Wipe old and re-insert
        s.table("worker_ward_affinity").delete().eq("worker_id", worker_id).execute()
        inserts = [
            {"worker_id": worker_id, "ward_id": w, "affinity_score": aff, "calculated_on": now.isoformat()}
            for w, aff in affinities.items()
        ]
        s.table("worker_ward_affinity").insert(inserts).execute()
        print(f"  [{worker_id}] -> {len(affinities)} wards seeded. Top affinity: {max(affinities.values()):.3f}")

    # Final count
    final = s.table("worker_ward_affinity").select("id", count="exact").execute()
    print(f"\nDone. Total worker_ward_affinity rows now: {final.count}")

if __name__ == "__main__":
    seed_affinity()
