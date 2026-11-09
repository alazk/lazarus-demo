#!/usr/bin/env python3
"""
pull_sources.py — the address lists behind the scanner, one file per source.

Each source is pulled into data/sources/<key>.json, then `merge` builds
data/seeds.json from all of them. The scanner reads seeds.json only, so a
source can be refreshed or dropped without touching the code.

    python scripts/pull_sources.py elliptic     Binance hack 2026 blocklist (CSV, no key)
    python scripts/pull_sources.py fbi          FBI alerts for the Bybit and Binance hacks
    python scripts/pull_sources.py hackscan     Bybit's LazarusBounty hack-address feed
    python scripts/pull_sources.py all          the three above
    python scripts/pull_sources.py merge        rebuild data/seeds.json

Arkham is pulled by scripts/pull_arkham.py and lives in data/sources/arkham.json.

Only Ethereum addresses are kept. The graph layer reads Etherscan, so a Tron
or Bitcoin address can never be reached by a path and would only pad the count.
Nothing is written when a fetch fails or returns no addresses: an empty list
would silently shrink coverage.

After a merge that adds addresses, rebuild the hop map so the new ones are
reachable at two and three hops, not only at the live hop:

    python scripts/build_halo.py
"""

import json
import re
import sys
from typing import Optional
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "sources"
SEEDS = ROOT / "data" / "seeds.json"
SRC.mkdir(parents=True, exist_ok=True)

ETH = re.compile(r"\b0x[0-9a-fA-F]{40}\b")
# fbi.gov answers 403 to anything that does not look like a browser.
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      "Accept": "text/html,application/json;q=0.9,*/*;q=0.8"}

# Order matters: when an address is on several lists, the first one here is
# the label the page shows. Attribution to an entity beats attribution to an
# incident, and an official alert beats a private blocklist.
SOURCES = {
    "arkham": {
        "name": "Arkham Intelligence",
        "label": "Lazarus Group",
        "incident": None,
        "url": "https://intel.arkm.com/explorer/entity/lazarus-group",
    },
    "fbi": {
        "name": "FBI",
        "label": "TraderTraitor (Lazarus Group)",
        "incident": "bybit-2025, binance-2026",
        "url": "https://www.fbi.gov/investigate/cyber/alerts",
        "pages": {
            "bybit-2025": "https://www.fbi.gov/investigate/cyber/alerts/2025/north-korea-responsible-for-1-5-billion-bybit-hack",
            "binance-2026": "https://www.fbi.gov/investigate/cyber/alerts/2026/north-korea-responsible-for-6-billion-binance-attack",
        },
    },
    "elliptic": {
        "name": "Elliptic",
        "label": "Binance hack 2026",
        "incident": "binance-2026",
        "url": "https://www.elliptic.co/binance-hack-2026-blocklist/",
        "csv": "https://data-cdn.elliptic.co/blocklists/binance-hack-blocklist.csv",
    },
    "hackscan": {
        "name": "Bybit HackScan",
        "label": "Bybit hack 2025",
        "incident": "bybit-2025",
        "url": "https://www.bybit.com/en/help-center/article/FAQ-LazarusBounty",
        "json": "https://hackscan.hackbounty.io/public/hack-address.json",
    },
}


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def fetch(url: str) -> bytes:
    with urlopen(Request(url, headers=UA), timeout=60) as r:
        return r.read()


def eth_addresses(text: str) -> list:
    seen, out = set(), []
    for a in ETH.findall(text):
        a = a.lower()
        if a not in seen:
            seen.add(a)
            out.append(a)
    return out


def write_source(key: str, addresses: list, extra: Optional[dict] = None) -> None:
    if not addresses:
        sys.exit(f"{key}: no Ethereum addresses found, nothing written")
    meta = SOURCES[key]
    out = {
        "key": key,
        "name": meta["name"],
        "label": meta["label"],
        "incident": meta["incident"],
        "url": meta["url"],
        "pulled_at": now(),
        "chain": "ethereum",
        "count": len(addresses),
        **(extra or {}),
        "addresses": addresses,
    }
    (SRC / f"{key}.json").write_text(json.dumps(out, indent=1) + "\n")
    print(f"{key}: {len(addresses)} Ethereum addresses -> data/sources/{key}.json")


# ---------------------------------------------------------------------------

def pull_elliptic() -> None:
    text = fetch(SOURCES["elliptic"]["csv"]).decode("utf-8", "replace")
    rows = [l.strip() for l in text.splitlines() if l.strip()]
    addrs = eth_addresses("\n".join(rows))
    write_source("elliptic", addrs, {"rows_all_chains": len(rows)})


def pull_fbi() -> None:
    # The alerts are HTML pages listing addresses in plain text. Each address
    # is tagged with the alert it came from so a result can cite the right one.
    by_incident, incident_of, addrs = {}, {}, []
    for incident, url in SOURCES["fbi"]["pages"].items():
        found = eth_addresses(fetch(url).decode("utf-8", "replace"))
        if not found:
            sys.exit(f"fbi: {url} yielded no addresses; the page layout may have changed")
        by_incident[incident] = {"url": url, "count": len(found)}
        for a in found:
            if a not in incident_of:
                incident_of[a] = incident
                addrs.append(a)
    write_source("fbi", addrs, {"alerts": by_incident, "incident_of": incident_of})


def pull_hackscan() -> None:
    body = json.loads(fetch(SOURCES["hackscan"]["json"]))
    addrs = eth_addresses(json.dumps(body))
    shape = type(body).__name__ + (f" with keys {list(body)[:8]}" if isinstance(body, dict) else "")
    write_source("hackscan", addrs, {"shape": shape})


# ---------------------------------------------------------------------------

def merge() -> None:
    files = {p.stem: json.loads(p.read_text()) for p in sorted(SRC.glob("*.json"))}
    if "arkham" not in files:
        sys.exit("data/sources/arkham.json is missing; run pull_arkham.py first")

    order = [k for k in SOURCES if k in files] + [k for k in files if k not in SOURCES]
    merged = {}
    for key in order:
        src = files[key]
        incident_of = src.get("incident_of", {})
        for a in src["addresses"]:
            a = a.lower()
            entry = merged.setdefault(a, {
                "address": a,
                "label": src["label"],
                "source": key,
                "incident": incident_of.get(a, src.get("incident")),
                "sources": [],
            })
            if key not in entry["sources"]:
                entry["sources"].append(key)

    summary = {k: {"name": files[k]["name"], "label": files[k]["label"], "url": files[k]["url"],
                   "pulled_at": files[k]["pulled_at"], "count": len(files[k]["addresses"])}
               for k in order}
    only = {k: sum(1 for e in merged.values() if e["sources"] == [k]) for k in order}

    out = {
        "pulled_at": max(files[k]["pulled_at"] for k in order),
        "chain": "ethereum",
        "count": len(merged),
        "sources": summary,
        "unique_to_source": only,
        "addresses": sorted(merged.values(), key=lambda e: e["address"]),
    }
    SEEDS.write_text(json.dumps(out, indent=1) + "\n")
    print(f"seeds.json: {len(merged)} addresses from {len(order)} sources")
    for k in order:
        print(f"  {k:9} {summary[k]['count']:6}   only here: {only[k]}")


COMMANDS = {"elliptic": pull_elliptic, "fbi": pull_fbi, "hackscan": pull_hackscan, "merge": merge}

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "all":
        # One source failing should not stop the others or the merge; the
        # failure is reported and that source keeps its last good file.
        failed = []
        for c in ("elliptic", "fbi", "hackscan"):
            try:
                COMMANDS[c]()
            except SystemExit as e:
                failed.append(c); print(f"{c}: skipped ({e})")
            except Exception as e:
                failed.append(c); print(f"{c}: skipped ({type(e).__name__}: {e})")
        merge()
        if failed:
            print(f"\nnot refreshed: {', '.join(failed)}")
    elif cmd in COMMANDS:
        COMMANDS[cmd]()
    else:
        sys.exit(__doc__)
