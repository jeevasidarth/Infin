import os
import requests
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional
from weather_config import CITIES, DVS_WEIGHTS

class NewsService:
    def __init__(self, supabase_client):
        self.supabase = supabase_client
        self.newsapi_key = os.environ.get("NEWSAPI_API_KEY")
        self.keywords = ["bandh", "strike", "protest", "shutdown", "road block", "market closure", "public unrest"]

    def _fetch_newsapi(self, city: str) -> List[Dict[str, Any]]:
        """Fetch news from NewsAPI (Primary)"""
        if not self.newsapi_key or self.newsapi_key == "your_newsapi_key_here":
            return []

        # From 24 hours ago
        from_time = (datetime.now(timezone.utc) - timedelta(hours=24)).strftime('%Y-%m-%dT%H:%M:%S')
        query = f"({ ' OR '.join(self.keywords) }) AND {city}"
        url = f"https://newsapi.org/v2/everything?q={query}&from={from_time}&sortBy=publishedAt&apiKey={self.newsapi_key}&language=en"

        try:
            resp = requests.get(url, timeout=10).json()
            if resp.get("status") != "ok":
                print(f"[NewsService] NewsAPI error: {resp.get('message')}")
                return []
            
            articles = resp.get("articles", [])
            normalized = []
            for art in articles:
                normalized.append({
                    "headline": art.get("title"),
                    "description": art.get("description"),
                    "published_at": art.get("publishedAt"),
                    "source": f"NewsAPI: {art.get('source', {}).get('name')}"
                })
            return normalized
        except Exception as e:
            print(f"[NewsService] NewsAPI fetch error for {city}: {e}")
            return []

    def _fetch_currents(self, city: str) -> List[Dict[str, Any]]:
        """Fetch news from Currents API (Secondary)"""
        if not self.currents_key or self.currents_key == "your_currents_key_here":
            return []

        # Currents uses keywords parameter
        query = f"{city} {' '.join(self.keywords)}"
        url = f"https://api.currentsapi.services/v1/search?keywords={query}&language=en&apiKey={self.currents_key}"

        return {"severity": severity, "affected_services": services}

    def _determine_severity(self, headline: str, description: str) -> Dict[str, str]:
        """Categorize event severity and affected services based on keywords"""
        text = (headline + " " + (description or "")).lower()
        
        severity = "Medium"
        services = "General"

        if any(w in text for w in ["bandh", "shutdown", "total shutdown"]):
            severity = "High"
            services = "All Services, Delivery, Transport"
        elif any(w in text for w in ["strike", "transport strike", "truck strike", "bus strike"]):
            severity = "High"
            services = "Transport, Delivery"
        elif any(w in text for w in ["road block", "road closure", "blocked"]):
            severity = "Medium"
            services = "Logistics, Delivery"
        elif any(w in text for w in ["protest", "march"]):
            severity = "Medium"
            services = "Local Routes"
            
        return {"severity": severity, "affected_services": services}

    def _calculate_news_dvs(self, primary_match: bool, severity: str) -> Dict[str, float]:
        """Calculates Gate 1 DVS for news events (Single-source logic)"""
        
        # Source Agreement (60%)
        # As per user spec: Single-source trigger = 1.0 if API confirms
        agreement = 1.0 if primary_match else 0.0
            
        # Threshold Breach (40%)
        # Severity mapping: High = 1.0, Medium = 0.5, Low = 0.2
        breach = 0.0
        if severity == "High":
            breach = 1.0
        elif severity == "Medium":
            breach = 0.5
        elif severity == "Low":
            breach = 0.2
            
        dvs = (agreement * DVS_WEIGHTS["source_agreement"]) + (breach * DVS_WEIGHTS["threshold_breach"])
        
        return {
            "dvs_score": round(dvs, 2),
            "source_agreement_score": agreement,
            "threshold_breach_score": breach
        }

    async def fetch_city_news(self, city: str) -> Optional[Dict[str, Any]]:
        # 1. Fetch from NewsAPI
        print(f"[NewsService] Fetching news for {city}...")
        articles = self._fetch_newsapi(city)
        if not articles:
            print(f"[NewsService] No articles found for {city} in last 24h.")
            return None
            
        # 2. Pick the most recent/relevant headline
        master = articles[0]
        print(f"[NewsService] Found match for {city}: {master['headline'][:50]}...")
            
        # 3. Analyze matches for DVS
        analysis = self._determine_severity(master["headline"], master["description"])
        dvs_results = self._calculate_news_dvs(True, analysis["severity"])
        
        # 4. Construct Final Record
        final_record = {
            "city": city,
            "event_type": analysis["severity"] + " Disruption",
            "headline": master["headline"],
            "description": master["description"],
            "severity": analysis["severity"],
            "affected_services": analysis["affected_services"],
            "published_at": master["published_at"],
            "source_used": master["source"],
            "trust_score": 0.8, # Single source baseline trust
            "dvs_score": dvs_results["dvs_score"],
            "source_agreement_score": dvs_results["source_agreement_score"],
            "threshold_breach_score": dvs_results["threshold_breach_score"],
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        # 5. Cache in DB
        self.supabase.table("disruption_news").upsert(final_record, on_conflict="city").execute()
        
        return final_record

    async def update_all_cities(self):
        print(f"[NewsService] Refreshing news for all cities at {datetime.now()}...")
        for city in CITIES.keys():
            await self.fetch_city_news(city)
        print("[NewsService] News refresh complete.")
