"""
Unit test for News DVS logic and normalization.
"""
import asyncio
from news_service import NewsService

class MockSupabase:
    def table(self, name): return self
    def upsert(self, *a, **k): return self
    def execute(self): return self

def test_news_logic():
    svc = NewsService(MockSupabase())
    
    print("=" * 60)
    print("News Disruption Logic & DVS Verification")
    print("=" * 60)

    # Test cases
    test_data = [
        {
            "name": "Scenario A: High Impact Bandh (Single Source)",
            "headline": "Total Bandh in Bangalore tomorrow over water dispute",
            "desc": "Public transport and markets to remain shut across the city.",
            "primary": True,
            "expected_severity": "High",
            "expected_pass": True # agreement 1.0 + breach 1.0 = 1.0
        },
        {
            "name": "Scenario B: Medium Impact Protest (Single Source)",
            "headline": "Farmers protest in Chennai causes traffic jams",
            "desc": "Local police advise avoiding central routes.",
            "primary": True,
            "expected_severity": "Medium",
            "expected_pass": True # agreement 1.0 * 0.6 + breach 0.5 * 0.4 = 0.6 + 0.2 = 0.8 (>0.7)
        },
        {
            "name": "Scenario C: Low Impact Event (Single Source)",
            "headline": "Small gathering in Hyderabad",
            "desc": "No disruption expected.",
            "primary": True,
            "expected_severity": "Low",
            "expected_pass": False # agreement 1.0 * 0.6 + breach 0.2 * 0.4 = 0.6 + 0.08 = 0.68 (<0.7)
        }
    ]

    all_pass = True
    for t in test_data:
        analysis = svc._determine_severity(t["headline"], t["desc"])
        dvs = svc._calculate_news_dvs(t["primary"], analysis["severity"])
        
        passed = dvs["dvs_score"] >= 0.70
        is_ok = passed == t["expected_pass"]
        if not is_ok: all_pass = False
        
        print(f"\n[{'OK' if is_ok else 'FAIL'}] {t['name']}")
        print(f"  Detected Severity : {analysis['severity']}")
        print(f"  DVS Score         : {dvs['dvs_score']}")
        print(f"  Agreement Score   : {dvs['source_agreement_score']}")
        print(f"  Gate Status       : {'PASS' if passed else 'FAIL'}")

    print("\n" + "=" * 60)
    print("RESULT:", "ALL TESTS PASSED" if all_pass else "SOME TESTS FAILED")
    print("=" * 60)

if __name__ == "__main__":
    test_news_logic()
