#!/usr/bin/env python3
"""Daily USD prices for the assets the graph values.

Source is Coinbase's public candles endpoint: keyless, daily history back to
2016, at most 300 candles per request so each series is fetched in windows.
Stablecoins need no prices; only ETH and BTC do.
"""
import json, time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

DATA = Path(__file__).resolve().parent.parent / "data"
API = "https://api.exchange.coinbase.com/products"
EARLIEST = datetime(2016, 1, 1, tzinfo=timezone.utc)
WINDOW = 290

def fetch_series(product):
    out = {}
    start = EARLIEST
    now = datetime.now(timezone.utc)
    while start < now:
        end = min(start + timedelta(days=WINDOW), now)
        url = (f"{API}/{product}/candles?granularity=86400"
               f"&start={start:%Y-%m-%dT%H:%M:%SZ}&end={end:%Y-%m-%dT%H:%M:%SZ}")
        rows = None
        for attempt in range(4):
            try:
                req = Request(url, headers={"User-Agent": "curl/8.4.0",
                                            "Accept": "application/json"})
                with urlopen(req, timeout=45) as resp:
                    rows = json.loads(resp.read().decode())
                break
            except (HTTPError, URLError):
                time.sleep(1 + attempt)
        if rows is None:
            print(f"  {product}: window from {start:%Y-%m-%d} failed, skipping")
        else:
            for row in rows:
                day = datetime.fromtimestamp(row[0], timezone.utc).strftime("%Y-%m-%d")
                out[day] = float(row[4])
        start = end
        time.sleep(0.25)
        print(f"  {product}: {len(out)} days through {end:%Y-%m-%d}", end="\r")
    print()
    return out

def main():
    prices = {}
    for symbol, product in (("ETH", "ETH-USD"), ("BTC", "BTC-USD")):
        print(f"fetching {product}")
        series = fetch_series(product)
        if not series:
            raise SystemExit(f"{product}: no data returned")
        prices[symbol] = series
    out = {"built_at": datetime.now(timezone.utc).isoformat(),
           "source": "Coinbase daily candles, close",
           "note": "Stablecoins are valued one-to-one. A transfer is valued at the close on the day it happened.",
           "prices": prices}
    (DATA / "prices.json").write_text(json.dumps(out))
    for symbol, series in prices.items():
        days = sorted(series)
        print(f"{symbol}: {len(series)} days, {days[0]} to {days[-1]}, latest ${series[days[-1]]:,.0f}")
    print(f"\ndata/prices.json is {(DATA/'prices.json').stat().st_size/1e6:.2f} MB")

main()
