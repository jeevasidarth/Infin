import os
import requests
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from weather_config import CITIES, DVS_WEIGHTS

# AQI-specific threshold (CPCB Hazardous scale)
AQI_THRESHOLD = 300.0

# Risk level mapping (US EPA / CPCB scale)
def get_risk_level(aqi: float) -> Dict[str, str]:
    if aqi <= 50:
        return {"risk_level": "Good", "health_advisory": "Air quality is satisfactory. No health risk."}
    elif aqi <= 100:
        return {"risk_level": "Moderate", "health_advisory": "Acceptable quality. Sensitive groups may experience minor issues."}
    elif aqi <= 150:
        return {"risk_level": "Unhealthy for Sensitive Groups", "health_advisory": "People with respiratory conditions should limit outdoor activity."}
    elif aqi <= 200:
        return {"risk_level": "Unhealthy", "health_advisory": "Everyone may experience health effects. Limit prolonged outdoor activity."}
    elif aqi <= 300:
        return {"risk_level": "Very Unhealthy", "health_advisory": "Health alert: Serious effects possible for entire population."}
    else:
        return {"risk_level": "Hazardous", "health_advisory": "Emergency conditions. Entire population likely affected. Avoid all outdoor activity."}


class AQIService:
    def __init__(self, supabase_client):
        self.supabase = supabase_client
        self.waqi_key = os.environ.get("WAQI_API_KEY")

    def _fetch_open_meteo(self, lat: float, lon: float) -> Optional[Dict[str, Any]]:
        """Fetch AQI data from Open-Meteo (no API key required)."""
        url = (
            f"https://air-quality-api.open-meteo.com/v1/air-quality"
            f"?latitude={lat}&longitude={lon}"
            f"&current=us_aqi,pm10,pm2_5"
        )
        try:
            resp = requests.get(url, timeout=10).json()
            current = resp.get("current", {})
            if "us_aqi" not in current:
                return None
            return {
                "aqi": float(current.get("us_aqi", 0)),
                "pm2_5": float(current.get("pm2_5", 0)),
                "pm10": float(current.get("pm10", 0)),
                "source": "Open-Meteo"
            }
        except Exception as e:
            print(f"[AQIService] Open-Meteo fetch error: {e}")
            return None

    def _fetch_waqi(self, lat: float, lon: float) -> Optional[Dict[str, Any]]:
        """Fetch AQI data from WAQI (World Air Quality Index) as validation source."""
        if not self.waqi_key or self.waqi_key == "your_waqi_key_here":
            # Return None gracefully if no key is set
            return None
        url = f"https://api.waqi.info/feed/geo:{lat};{lon}/?token={self.waqi_key}"
        try:
            resp = requests.get(url, timeout=10).json()
            if resp.get("status") != "ok":
                return None
            data = resp.get("data", {})
            iaqi = data.get("iaqi", {})
            return {
                "aqi": float(data.get("aqi", 0)),
                "pm2_5": float(iaqi.get("pm25", {}).get("v", 0)),
                "pm10": float(iaqi.get("pm10", {}).get("v", 0)),
                "source": "WAQI"
            }
        except Exception as e:
            print(f"[AQIService] WAQI fetch error: {e}")
            return None

    def _calculate_aqi_dvs(self, primary: Dict, secondary: Optional[Dict]) -> Dict[str, float]:
        """Calculates Gate 1 DVS using AQI >= 300 as threshold (independent trigger)."""
        thresh = AQI_THRESHOLD
        aqi_primary = primary["aqi"]
        aqi_secondary = secondary["aqi"] if secondary else None

        # Source Agreement
        confirm_primary = 1 if aqi_primary >= thresh else 0
        if secondary is not None:
            confirm_secondary = 1 if aqi_secondary >= thresh else 0
            total_confirms = confirm_primary + confirm_secondary
            agreement = 1.0 if total_confirms == 2 else 0.5 if total_confirms == 1 else 0.0
            actual_aqi = max(aqi_primary, aqi_secondary)
        else:
            # Single-source: 1.0 if API confirms
            agreement = 1.0 if confirm_primary else 0.0
            actual_aqi = aqi_primary

        # Threshold Breach Score
        breach = 0.0
        if actual_aqi > thresh:
            breach = min(1.0, ((actual_aqi - thresh) / thresh) * 2)

        dvs = round((agreement * DVS_WEIGHTS["source_agreement"]) + (breach * DVS_WEIGHTS["threshold_breach"]), 2)

        return {
            "dvs_score": dvs,
            "source_agreement_score": agreement,
            "threshold_breach_score": round(breach, 2)
        }

    def _calculate_trust_score(self, primary: Dict, secondary: Optional[Dict]) -> float:
        """Trust is based on variance between the two AQI sources."""
        if secondary is None:
            return 0.75  # Single source — partially trusted
        aqi_diff = abs(primary["aqi"] - secondary["aqi"])
        score = 1.0 - min(1.0, aqi_diff / 100)  # Penalty: 1% per unit of variance up to 100 units
        return round(max(0.0, score), 2)

    async def fetch_city_aqi(self, city: str) -> Optional[Dict[str, Any]]:
        coords = CITIES.get(city)
        if not coords:
            return None

        lat, lon = coords["lat"], coords["lon"]

        # 1. Fetch from BOTH
        primary = self._fetch_open_meteo(lat, lon)
        secondary = self._fetch_waqi(lat, lon)

        if primary is None:
            print(f"[AQIService] Primary source (Open-Meteo) failed for {city}. Aborting.")
            return None

        # 2. Calculate DVS & Trust
        dvs_results = self._calculate_aqi_dvs(primary, secondary)
        trust_score = self._calculate_trust_score(primary, secondary)

        # 3. Master is Open-Meteo; enrich display fields with PM from secondary if available
        aqi_value = primary["aqi"]
        pm2_5 = primary["pm2_5"]
        pm10 = primary["pm10"]
        risk_info = get_risk_level(aqi_value)

        # 4. Construct final record for DB
        final_record = {
            "city": city,
            "aqi": aqi_value,
            "pm2_5": pm2_5,
            "pm10": pm10,
            "risk_level": risk_info["risk_level"],
            "health_advisory": risk_info["health_advisory"],
            "source_used": "Open-Meteo",
            "trust_score": trust_score,
            "dvs_score": dvs_results["dvs_score"],
            "source_agreement_score": dvs_results["source_agreement_score"],
            "threshold_breach_score": dvs_results["threshold_breach_score"],
            "updated_at": datetime.now(timezone.utc).isoformat()
        }

        # 5. Upsert into DB
        try:
            self.supabase.table("aqi_snapshots").upsert(final_record, on_conflict="city").execute()
            print(f"[AQIService] {city} cached — AQI={aqi_value}, DVS={dvs_results['dvs_score']}, Risk={risk_info['risk_level']}")
        except Exception as e:
            print(f"[AQIService] DB cache error for {city}: {e}")

        return final_record

    async def update_all_cities(self):
        print(f"[AQIService] Refreshing AQI for all cities at {datetime.now()}...")
        for city in CITIES.keys():
            await self.fetch_city_aqi(city)
        print("[AQIService] AQI refresh complete.")
