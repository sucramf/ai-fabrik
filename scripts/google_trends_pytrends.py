#!/usr/bin/env python3
"""
Google Trends (pytrends) – trending searches, rising searches.
Tidsfilter: dagens trender (proxy för senaste 30 dagar / 12 månader).
Output: JSON array till stdout för AI_FABRIK trend_scout.
Kräver: pip install pytrends
"""
import json
import sys

def main():
    try:
        from pytrends.request import TrendReq
    except ImportError:
        print("[]")
        sys.exit(0)

    out = []
    try:
        pytrends = TrendReq(hl="en-US", tz=360)
        try:
            df = pytrends.trending_searches(pn="united_states")
            if df is not None and not df.empty:
                for i, row in df.head(15).iterrows():
                    term = str(row.iloc[0]).strip() if len(row) else ""
                    if term:
                        out.append({
                            "plattform": "Google Trends",
                            "trend": term,
                            "trend_score": max(50, 85 - i * 2),
                            "market_saturation": min(100, 40 + i * 3)
                        })
        except Exception:
            pass
        try:
            df2 = pytrends.realtime_trending_searches(pn="US")
            if df2 is not None and not df2.empty:
                for i, row in df2.head(10).iterrows():
                    term = str(row.iloc[0]).strip() if len(row) else ""
                    if term and not any(t.get("trend") == term for t in out):
                        out.append({
                            "plattform": "Google Trends",
                            "trend": term,
                            "trend_score": min(100, 90 - i),
                            "market_saturation": min(100, 35 + i * 2)
                        })
        except Exception:
            pass
    except Exception:
        out = []
    print(json.dumps(out, ensure_ascii=False))

if __name__ == "__main__":
    main()
