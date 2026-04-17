"""
Unit test for Gate 1 AQI DVS logic.
Tests both-source agreement and single-source fallback.
"""
import asyncio
from aqi_service import AQIService

class MockSupabase:
    def table(self, name): return self
    def upsert(self, *a, **k): return self
    def execute(self): return self

def test_aqi_dvs():
    svc = AQIService(MockSupabase())
    
    scenarios = [
        {
            "name": "A: Both confirm hazardous (AQI=350)",
            "primary":   {"aqi": 350, "pm2_5": 120, "pm10": 180},
            "secondary": {"aqi": 340, "pm2_5": 110, "pm10": 170},
            "expected_pass": True
        },
        {
            "name": "B: Only primary confirms (AQI=310 vs 250)",
            "primary":   {"aqi": 310, "pm2_5": 100, "pm10": 150},
            "secondary": {"aqi": 250, "pm2_5": 80,  "pm10": 120},
            "expected_pass": False  # agreement=0.5, breach small -> DVS < 0.70
        },
        {
            "name": "C: Neither confirms (AQI=200/180)",
            "primary":   {"aqi": 200, "pm2_5": 60, "pm10": 90},
            "secondary": {"aqi": 180, "pm2_5": 55, "pm10": 85},
            "expected_pass": False
        },
        {
            "name": "D: No secondary key, single source at 400",
            "primary":   {"aqi": 400, "pm2_5": 200, "pm10": 300},
            "secondary": None,  # WAQI not configured
            "expected_pass": True  # single-source confirms -> agreement=1.0
        },
        {
            "name": "E: Both confirm extreme (AQI=500)",
            "primary":   {"aqi": 500, "pm2_5": 250, "pm10": 400},
            "secondary": {"aqi": 480, "pm2_5": 240, "pm10": 380},
            "expected_pass": True
        },
    ]

    print("=" * 60)
    print("Gate 1 — AQI DVS Mathematical Verification")
    print(f"Threshold: AQI >= 300 | Pass: DVS >= 0.70")
    print("=" * 60)

    all_pass = True
    for s in scenarios:
        res = svc._calculate_aqi_dvs(s["primary"], s["secondary"])
        passed = res["dvs_score"] >= 0.70
        expected = s["expected_pass"]
        ok = "PASS" if passed == expected else "MISMATCH"
        if passed != expected:
            all_pass = False

        print(f"\n{s['name']}")
        print(f"  Source Agreement : {res['source_agreement_score']:.2f}")
        print(f"  Threshold Breach : {res['threshold_breach_score']:.2f}")
        print(f"  DVS Score        : {res['dvs_score']:.2f}")
        print(f"  Gate Result      : {'PASS' if passed else 'FAIL'} [{ok}]")

    print("\n" + "=" * 60)
    print("Overall:", "ALL TESTS PASSED" if all_pass else "SOME TESTS FAILED")
    print("=" * 60)

if __name__ == "__main__":
    test_aqi_dvs()
