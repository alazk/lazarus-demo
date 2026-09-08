#!/usr/bin/env python3
"""
pull_arkham.py — the only script that touches Arkham. Run it once.

It writes two small files that get committed to the repo:

    data/seeds.json      Lazarus addresses, with provenance per address
    data/services.json   exchange / bridge / mixer addresses, used as the
                         terminal-node set during traversal

Nothing else in this project needs Arkham. The graph itself comes from
Etherscan at query time, so the demo keeps working after the key expires.

Usage:
    export ARKHAM_API_KEY=...
    python scripts/pull_arkham.py probe lazarus-group   # check the shape first
    python scripts/pull_arkham.py seeds
    python scripts/pull_arkham.py services
"""

import hashlib
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

# api.arkhamintelligence.com 307-redirects here, and redirects can drop the
# auth header, so talk to the live host directly.
API_BASE = "https://api.arkm.com"
CHAIN = "ethereum"

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".arkham_cache"
DATA = ROOT / "data"
CACHE.mkdir(exist_ok=True)
DATA.mkdir(exist_ok=True)

# Candidate slugs for the Lazarus entity. The first one that resolves wins.
LAZARUS_SLUGS = ["lazarus-group", "lazarus_group", "lazarus"]

# Entities whose addresses become the terminal set. These are the hubs that
# make an unbounded 3-hop rule meaningless, so we pull them deliberately.
SERVICE_SLUGS = [
    # centralised exchanges
    "binance", "coinbase", "okx", "kraken", "bybit", "htx", "kucoin",
    "bitget", "mexc", "gate-io", "crypto-com", "bitfinex", "upbit",
    "bithumb", "gemini", "bitstamp",
    # mixers and no-KYC swaps
    "tornado-cash", "railgun", "sinbad", "fixedfloat", "changenow",
    "simpleswap", "sideshift", "exch",
    # bridges
    "wormhole", "stargate", "across", "hop-protocol", "orbiter-finance",
    "synapse", "celer", "multichain", "layerzero",
    # dex / defi hubs
    "uniswap", "sushiswap", "1inch", "0x", "paraswap", "cowswap", "curve",
    "balancer", "aave", "compound", "lido", "eigenlayer",
    # market makers
    "wintermute", "jump-trading",
]

RATE_LIMIT = 1.05
_last = [0.0]


def api_key() -> str:
    key = os.environ.get("ARKHAM_API_KEY")
    if not key:
        sys.exit("ARKHAM_API_KEY is not set.")
    return key


def get(path: str) -> dict:
    """GET with a permanent disk cache. Nothing is fetched twice."""
    url = f"{API_BASE}{path}"
    cached = CACHE / f"{hashlib.sha1(url.encode()).hexdigest()}.json"
    if cached.exists():
        return json.loads(cached.read_text())

    wait = RATE_LIMIT - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)

    for attempt in range(5):
        try:
            # Cloudflare fronts this host and rejects Python-urllib's default
            # user agent with error 1010, so send one it will accept.
            req = Request(url, headers={"API-Key": api_key(),
                                        "Accept": "application/json",
                                        "User-Agent": "curl/8.4.0"})
            with urlopen(req, timeout=300) as resp:
                payload = {"_url": url, "data": json.loads(resp.read().decode())}
            _last[0] = time.time()
            cached.write_text(json.dumps(payload))
            return payload
        except HTTPError as e:
            if e.code in (429, 500, 502, 503, 504):
                time.sleep(2 ** attempt)
                continue
            if e.code in (401, 403):
                sys.exit(f"HTTP {e.code} from {url}\n{e.read()[:200].decode(errors='replace')}\n"
                         "Not cached. Fix the key or headers and rerun.")
            # A genuine 404 (wrong slug) is a real answer and worth caching.
            payload = {"_url": url, "data": None, "_status": e.code}
            cached.write_text(json.dumps(payload))
            return payload
        except OSError:
            time.sleep(2 ** attempt)
    raise RuntimeError(f"gave up on {url}")


def entity_addresses(slug: str) -> tuple[list[str], dict[str, int]]:
    """GET /intelligence/entity/{slug}/addresses

    Returns Ethereum addresses plus a per-chain count. The response shape is
    {"addresses": {"ethereum": [...], "arbitrum_one": [...], ...}}, so the
    chain filter is a dictionary lookup rather than a guess.

    Lazarus holds addresses on Tron and Bitcoin too. Those are real, but this
    demo traces Ethereum, and mixing chains into one seed list would produce
    addresses the graph layer can never reach.
    """
    payload = get(f"/intelligence/entity/{slug}/addresses")
    buckets = ((payload.get("data") or {}).get("addresses")) or {}
    if not isinstance(buckets, dict):
        return [], {}

    counts = {chain: len(rows) for chain, rows in buckets.items()
              if isinstance(rows, list)}

    found = [
        a.lower() for a in buckets.get(CHAIN, [])
        if isinstance(a, str) and a.startswith("0x") and len(a) == 42
    ]
    return sorted(set(found)), counts


def cmd_probe(slug: str = "lazarus-group"):
    addresses, counts = entity_addresses(slug)
    for chain, n in sorted(counts.items(), key=lambda kv: -kv[1]):
        marker = "  <- seeds" if chain == CHAIN else ""
        print(f"  {chain:20s} {n:>6}{marker}")
    print(f"\n{len(addresses)} {CHAIN} addresses")
    for a in addresses[:5]:
        print(f"  {a}")


def cmd_seeds():
    """Resolve the Lazarus seed set. Provenance is recorded per address."""
    seeds: dict[str, dict] = {}

    # Anything supplied by hand takes precedence and keeps its own source.
    manual = DATA / "seeds_manual.json"
    if manual.exists():
        for row in json.loads(manual.read_text()):
            addr = row["address"].lower()
            seeds[addr] = {
                "address": addr,
                "label": row.get("label", "Lazarus Group"),
                "source": row.get("source", "supplied"),
            }
        print(f"{len(seeds)} from seeds_manual.json")

    for slug in LAZARUS_SLUGS:
        addresses, counts = entity_addresses(slug)
        if not addresses:
            continue
        skipped = {c: n for c, n in counts.items() if c != CHAIN}
        if skipped:
            print(f"  other chains not used as seeds: "
                  f"{', '.join(f'{c} {n}' for c, n in sorted(skipped.items()))}")
        for addr in addresses:
            seeds.setdefault(addr, {
                "address": addr,
                "label": "Lazarus Group",
                "source": f"arkham:entity/{slug}",
            })
        print(f"{len(addresses)} from arkham entity/{slug}")
        break

    out = {
        "pulled_at": datetime.now(timezone.utc).isoformat(),
        "chain": CHAIN,
        "count": len(seeds),
        "addresses": sorted(seeds.values(), key=lambda r: r["address"]),
    }
    (DATA / "seeds.json").write_text(json.dumps(out, indent=2))
    print(f"\n{len(seeds)} seeds -> data/seeds.json")
    if not seeds:
        print('Nothing resolved. Drop the supplied list into '
              'data/seeds_manual.json as [{"address":"0x...","source":"..."}].')


def cmd_services():
    """Pull the terminal-node set. These are recorded on paths, never crossed."""
    services: dict[str, str] = {}
    failed = []
    for slug in SERVICE_SLUGS:
        try:
            addresses, _ = entity_addresses(slug)
        except Exception as e:
            failed.append(slug)
            print(f"  {slug:20s} {'failed':>6}  ({type(e).__name__})")
            continue
        for addr in addresses:
            services.setdefault(addr, slug)
        print(f"  {slug:20s} {len(addresses):>6}")

    if failed:
        print(f"\n{len(failed)} slugs did not resolve: {', '.join(failed)}")
        print("Rerun to retry only those; everything else is cached. Nodes "
              "above high_degree_tx_count are treated as terminal anyway, "
              "which catches most unlabelled exchange wallets.")

    out = {
        "pulled_at": datetime.now(timezone.utc).isoformat(),
        "chain": CHAIN,
        "count": len(services),
        "note": ("Terminal nodes. A match here is reported on the path but the "
                 "traversal never continues through it."),
        "addresses": services,
    }
    (DATA / "services.json").write_text(json.dumps(out, indent=2))
    size = (DATA / "services.json").stat().st_size / 1_000_000
    print(f"\n{len(services)} service addresses -> data/services.json ({size:.1f} MB)")


if __name__ == "__main__":
    cmds = {"probe": cmd_probe, "seeds": cmd_seeds, "services": cmd_services}
    if len(sys.argv) < 2 or sys.argv[1] not in cmds:
        sys.exit(__doc__)
    cmds[sys.argv[1]](*sys.argv[2:])
