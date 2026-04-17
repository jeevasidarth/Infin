import os
import requests
import asyncio
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from weather_config import CITIES, TRUST_WEIGHTS, THRESHOLDS, DVS_WEIGHTS

class WeatherService:
    def __init__(self, supabase_client):
        self.supabase = supabase_client
        self.owm_key = os.environ.get("OPENWEATHER_API_KEY")
        self.wapi_key = os.environ.get("WEATHERAPI_API_KEY")

    def _normalize_owm(self, data: Dict[str, Any], city: str) -> Dict[str, Any]:
        """Convert OpenWeather response to common schema"""
        current = data.get("main", {})
        rain = data.get("rain", {}).get("1h", 0.0)
        return {
            "temperature_c": current.get("temp"),
            "feels_like_c": current.get("feels_like"),
            "rain_mm": float(rain),
            "humidity": current.get("humidity"),
            "wind_kph": data.get("wind", {}).get("speed", 0.0) * 3.6, # m/s to kph
            "condition": data.get("weather", [{}])[0].get("main"),
            "visibility_km": data.get("visibility", 0) / 1000,
            "city": city,
            "source": "OpenWeather"
        }

    def _normalize_wapi(self, data: Dict[str, Any], city: str) -> Dict[str, Any]:
        """Convert WeatherAPI response to common schema"""
        current = data.get("current", {})
        return {
            "temperature_c": current.get("temp_c"),
            "feels_like_c": current.get("feels_like_c"),
            "rain_mm": current.get("precip_mm"),
            "humidity": current.get("humidity"),
            "wind_kph": current.get("wind_kph"),
            "condition": current.get("condition", {}).get("text"),
            "visibility_km": current.get("vis_km"),
            "heat_index": current.get("heatindex_c"),
            "city": city,
            "source": "WeatherAPI"
        }

    def _calculate_dvs(self, owm: Dict[str, Any], wapi: Dict[str, Any]) -> Dict[str, float]:
        """Calculates Gate 1 - Disruption Validity Score (DVS)"""
        
        # 1. RAINFALL DVS
        rain_owm = owm["rain_mm"]
        rain_wapi = wapi["rain_mm"]
        thresh_rain = THRESHOLDS["heavy_rain_mm"]
        
        # Source Agreement
        confirm_owm = 1 if rain_owm >= thresh_rain else 0
        confirm_wapi = 1 if rain_wapi >= thresh_rain else 0
        agreement_rain = 1.0 if (confirm_owm + confirm_wapi == 2) else 0.5 if (confirm_owm + confirm_wapi == 1) else 0.0
        
        # Threshold Breach
        actual_rain = max(rain_owm, rain_wapi)
        breach_rain = 0.0
        if actual_rain > thresh_rain:
            breach_rain = min(1.0, ((actual_rain - thresh_rain) / thresh_rain) * 2)
        
        dvs_rain = (agreement_rain * DVS_WEIGHTS["source_agreement"]) + (breach_rain * DVS_WEIGHTS["threshold_breach"])

        # 2. HEAT DVS
        heat_owm = owm["temperature_c"]
        heat_wapi = wapi["temperature_c"]
        thresh_heat = THRESHOLDS["heatwave_c"]
        
        confirm_owm_h = 1 if heat_owm >= thresh_heat else 0
        confirm_wapi_h = 1 if heat_wapi >= thresh_heat else 0
        agreement_heat = 1.0 if (confirm_owm_h + confirm_wapi_h == 2) else 0.5 if (confirm_owm_h + confirm_wapi_h == 1) else 0.0
        
        actual_heat = max(heat_owm, heat_wapi)
        breach_heat = 0.0
        if actual_heat > thresh_heat:
            breach_heat = min(1.0, ((actual_heat - thresh_heat) / thresh_heat) * 2)
            
        dvs_heat = (agreement_heat * DVS_WEIGHTS["source_agreement"]) + (breach_heat * DVS_WEIGHTS["threshold_breach"])

        # 3. PICK HIGHEST BREACH (Independent trigger types)
        if dvs_rain >= dvs_heat:
            return {
                "dvs_score": round(dvs_rain, 2),
                "source_agreement_score": agreement_rain,
                "threshold_breach_score": round(breach_rain, 2)
            }
        else:
            return {
                "dvs_score": round(dvs_heat, 2),
                "source_agreement_score": agreement_heat,
                "threshold_breach_score": round(breach_heat, 2)
            }

    def _calculate_trust_score(self, owm: Dict[str, Any], wapi: Dict[str, Any]) -> float:
        score = 1.0
        
        # Temp variance
        temp_diff = abs(owm["temperature_c"] - wapi["temperature_c"])
        score -= temp_diff * TRUST_WEIGHTS["temp_variance_penalty"]
        
        # Rain variance
        rain_diff = abs(owm["rain_mm"] - wapi["rain_mm"])
        score -= rain_diff * TRUST_WEIGHTS["rain_variance_penalty"]
        
        # Condition mismatch
        if owm["condition"].lower() != wapi["condition"].lower():
            # Soft match check
            if not (owm["condition"].lower() in wapi["condition"].lower() or wapi["condition"].lower() in owm["condition"].lower()):
                score -= TRUST_WEIGHTS["condition_mismatch_penalty"]
        
        return max(0.0, round(score, 2))

    async def fetch_city_weather(self, city: str) -> Optional[Dict[str, Any]]:
        coords = CITIES.get(city)
        if not coords:
            return None

        # 1. Fetch from BOTH
        owm_url = f"https://api.openweathermap.org/data/2.5/weather?lat={coords['lat']}&lon={coords['lon']}&appid={self.owm_key}&units=metric"
        wapi_url = f"https://api.weatherapi.com/v1/current.json?key={self.wapi_key}&q={coords['lat']},{coords['lon']}"

        try:
            # Simple sync calls wrapped for background task
            owm_resp = requests.get(owm_url, timeout=10).json()
            wapi_resp = requests.get(wapi_url, timeout=10).json()

            if "main" not in owm_resp or "current" not in wapi_resp:
                print(f"[WeatherService] API Error for {city}: OWM={owm_resp.get('message')}, WAPI={wapi_resp.get('error', {}).get('message')}")
                return None

            owm_data = self._normalize_owm(owm_resp, city)
            wapi_data = self._normalize_wapi(wapi_resp, city)

            # 2. Calculate Trust & DVS
            trust_score = self._calculate_trust_score(owm_data, wapi_data)
            dvs_results = self._calculate_dvs(owm_data, wapi_data)
            
            # 3. Choose Master (Prefer WeatherAPI as requested)
            master_data = wapi_data
            rain_mm = master_data["rain_mm"]
            
            # 4. Construct Final Record
            final_record = {
                "city": city,
                "temperature_c": master_data["temperature_c"],
                "feels_like_c": master_data["feels_like_c"],
                "rain_mm": rain_mm,
                "rain_cm_display": round(rain_mm / 10, 1),
                "humidity": master_data["humidity"],
                "wind_kph": master_data["wind_kph"],
                "condition": master_data["condition"],
                "visibility_km": master_data["visibility_km"],
                "heat_index": master_data.get("heat_index") or master_data["temperature_c"],
                "alert_status": "Severe" if dvs_results["dvs_score"] >= 0.70 else "Normal",
                "source_used": "WeatherAPI",
                "trust_score": trust_score,
                "dvs_score": dvs_results["dvs_score"],
                "source_agreement_score": dvs_results["source_agreement_score"],
                "threshold_breach_score": dvs_results["threshold_breach_score"],
                "updated_at": datetime.now(timezone.utc).isoformat()
            }

            # 5. Cache in DB
            self.supabase.table("weather_snapshots").upsert(final_record, on_conflict="city").execute()
            
            return final_record

        except Exception as e:
            print(f"[WeatherService] Fatal error fetching {city}: {e}")
            return None

    async def update_all_cities(self):
        print(f"[WeatherService] Refreshing weather for all cities at {datetime.now()}...")
        for city in CITIES.keys():
            await self.fetch_city_weather(city)
        print("[WeatherService] Refresh complete.")
