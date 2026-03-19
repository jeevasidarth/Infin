import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import pandas as pd
from datetime import datetime
from supabase import create_client, Client

load_dotenv()

# App-level Supabase client
supabase: Client = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global supabase
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not url or not key:
        raise Exception("Missing SUPABASE_URL or SUPABASE_KEY in .env")
    supabase = create_client(url, key)
    print("Startup: Initialized Supabase client successfully")
    yield
    print("Shutdown: Cleaning up resources")

app = FastAPI(
    title="InFin Backend API",
    description="Engine 1 & 2 for Platform Worker Income Protection",
    lifespan=lifespan
)

# Allow React / Vite frontend to communicate
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Change in prod to actual frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {"status": "ok", "message": "InFin Engine Router is Online"}

@app.get("/api/v1/policy/quote")
async def get_policy_quote(user_id: str):
    if not supabase:
        raise HTTPException(status_code=500, detail="Database connection error")
        
    try:
        # 1. Fetch worker
        worker_res = supabase.table("workers").select("*").eq("id", user_id).execute()
        worker = worker_res.data[0] if worker_res.data else None
        
        if not worker:
            raise HTTPException(status_code=404, detail="Worker not found")
            
        city = worker.get("city")
        print(f"[Engine 1] Worker city from DB: '{city}'")
        
        # 2. Fetch DP value for the city — use ilike for case-insensitive matching
        dp_res = supabase.table("dp_table").select("dp_value").ilike("city", city).execute()
        print(f"[Engine 1] DP table result: {dp_res.data}")
        disruption_probability = dp_res.data[0]['dp_value'] if dp_res.data else 0.05
        
        # 3. Fetch earnings history for the past 30 days
        earnings_res = supabase.table("earnings_history").select("date", "earnings").eq("worker_id", user_id).order("date").limit(30).execute()
        
        expected_daily_earnings = 800 # fallback
        
        if earnings_res.data and len(earnings_res.data) > 0:
            # Calculate simple Exponential Moving Average using pandas
            df = pd.DataFrame(earnings_res.data)
            df['earnings'] = pd.to_numeric(df['earnings'])
            ema = df['earnings'].ewm(span=7, adjust=False).mean()
            if not ema.empty:
                expected_daily_earnings = float(ema.iloc[-1])
                
        # 4. Engine 1 Formula Calculate Premium
        weekly_premium = round(expected_daily_earnings * disruption_probability * 0.70 * 1.15 / 0.65)
        
        return {
            "worker_id": user_id,
            "expected_daily_earnings": round(expected_daily_earnings),
            "disruption_probability": disruption_probability,
            "weekly_premium": weekly_premium
        }
        
    except Exception as e:
        print(f"Error calculating quote: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
