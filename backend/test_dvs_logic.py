import asyncio
from weather_service import WeatherService
from weather_config import THRESHOLDS

class MockSupabase:
    def table(self, name): return self
    def upsert(self, data, on_conflict): return self
    def execute(self): return self

async def test_dvs_math():
    print("Testing Gate 1 DVS Mathematical Scenarios...\n")
    service = WeatherService(MockSupabase())
    
    scenarios = [
        {
            "name": "Scenario A: Borderline (37mm rain, both confirm)",
            "owm": {"temperature_c": 28, "rain_mm": 37, "condition": "Rain"},
            "wapi": {"temperature_c": 28, "rain_mm": 37, "condition": "Rain"},
            "expected_pass": True # High agreement (1.0) + small breach
        },
        {
            "name": "Scenario B: Borderline Failure (37mm rain, only one source)",
            "owm": {"temperature_c": 28, "rain_mm": 10, "condition": "Cloudy"},
            "wapi": {"temperature_c": 28, "rain_mm": 37, "condition": "Rain"},
            "expected_pass": False # Low agreement (0.5) + small breach
        },
        {
            "name": "Scenario C: Strong Disruption (52mm rain, both confirm)",
            "owm": {"temperature_c": 28, "rain_mm": 52, "condition": "Storm"},
            "wapi": {"temperature_c": 28, "rain_mm": 52, "condition": "Storm"},
            "expected_pass": True
        },
        {
             "name": "Scenario D: Heatwave (43C, both confirm)",
             "owm": {"temperature_c": 43, "rain_mm": 0, "condition": "Sunny"},
             "wapi": {"temperature_c": 43, "rain_mm": 0, "condition": "Sunny"},
             "expected_pass": True
        }
    ]

    for s in scenarios:
        res = service._calculate_dvs(s["owm"], s["wapi"])
        score = res["dvs_score"]
        passed = score >= 0.70
        status = "PASS" if passed else "FAIL"
        
        print(f"--- {s['name']} ---")
        print(f"Agreement: {res['source_agreement_score']}")
        print(f"Breach: {res['threshold_breach_score']}")
        print(f"Total DVS: {score}")
        print(f"Result: {status} (Expected Pass: {s['expected_pass']})")
        
        if passed != s["expected_pass"]:
            print("!! MATH MISMATCH !!")
        print()

if __name__ == "__main__":
    asyncio.run(test_dvs_math())
