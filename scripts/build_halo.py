#!/usr/bin/env python3
"""
build_halo.py — precompute the neighbourhood around the Lazarus seed set.

Public Etherscan data only. Re-runnable, no vendor dependency, nothing
proprietary in the output.

Why a halo. Screening a wallet live to three hops means expanding its
neighbours and their neighbours, which is hundreds of API calls per request.
Distance is symmetric, so we walk two hops outward from the seeds once and
store the result. A live screening then needs the submitted wallet's own
counterparties and nothing more:

    counterparty is a seed       -> 1 hop
    counterparty at distance 1   -> 2 hops
    counterparty at distance 2   -> 3 hops

The build runs in two phases because the cost of the second cannot be known
before the first has run. Phase one expands every seed and reports how many
distinct level-one nodes actually exist, which depends entirely on how much
the seeds' counterparties overlap. Phase two then expands those, highest
transfer value first, until the call budget runs out.

Usage:
    export ETHERSCAN_API_KEY=...
    python3 scripts/build_halo.py            # stops after phase one to report
    python3 scripts/build_halo.py --yes      # runs straight through
    python3 scripts/build_halo.py --emit     # write halo.json from what exists

Resumable. Interrupt it whenever; rerunning continues from the checkpoint.
"""

import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
STATE = ROOT / ".halo_state.json"

CFG = json.loads((DATA / "config.json").read_text())
API = "https://api.etherscan.io/v2/api"
RATE_LIMIT = 0.21          # free tier allows 5 calls/sec
PAGE = 2000
CALLS_PER_NODE = 3         # txlist, txlistinternal, tokentx

_last = [0.0]
_calls = [0]


def api_key() -> str:
    key = os.environ.get("ETHERSCAN_API_KEY")
    if not key:
        sys.exit("ETHERSCAN_API_KEY is not set.")
    return key


def call(params: dict) -> list:
    params = {**params, "chainid": CFG["chain_id"], "apikey": api_key()}
    url = f"{API}?{urlencode(params)}"

    for attempt in range(5):
        wait = RATE_LIMIT - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        try:
            req = Request(url, headers={"User-Agent": "curl/8.4.0"})
            with urlopen(req, timeout=45) as resp:
                body = json.loads(resp.read().decode())
            _last[0] = time.time()
            _calls[0] += 1
        except (HTTPError, OSError):
            time.sleep(2 ** attempt)
            continue

        result = body.get("result")
        if body.get("status") == "1" and isinstance(result, list):
            return result
        if isinstance(result, str):
            if "No transactions" in result:
                return []
            if "rate limit" in result.lower() or "Max calls" in result:
                time.sleep(1 + attempt)
                continue
        return []
    return []


# ---------------------------------------------------------------------------
# Edge extraction. Must stay in step with the same logic in api/screen.js.
# ---------------------------------------------------------------------------

def _passes_native(value_wei: str) -> bool:
    try:
        return int(value_wei) / 1e18 >= CFG["min_eth"]
    except (TypeError, ValueError):
        return False


def _passes_token(row: dict) -> bool:
    floor = CFG["token_floors"].get(row.get("tokenSymbol"))
    if floor is None:
        return False        # unlisted tokens are the dust-poisoning vector
    try:
        amount = int(row["value"]) / (10 ** int(row["tokenDecimal"]))
    except (KeyError, TypeError, ValueError, ZeroDivisionError):
        return False
    return amount >= floor


def counterparties(address: str) -> tuple[dict, bool]:
    """Return {counterparty: {weight, tx, ts}} and a high-degree flag."""
    address = address.lower()
    out: dict[str, dict] = {}
    total_rows = 0

    common = {"module": "account", "address": address, "startblock": 0,
              "endblock": 99999999, "sort": "desc", "page": 1, "offset": PAGE}

    for action in ("txlist", "txlistinternal", "tokentx"):
        rows = call({**common, "action": action})
        total_rows += len(rows)
        for row in rows:
            if row.get("isError") == "1":
                continue
            if action == "tokentx":
                if not _passes_token(row):
                    continue
                weight = 1.0
            else:
                if not _passes_native(row.get("value", "0")):
                    continue
                weight = int(row["value"]) / 1e18

            frm = (row.get("from") or "").lower()
            to = (row.get("to") or "").lower()
            other = to if frm == address else frm
            if not other or other == address or not other.startswith("0x"):
                continue

            prior = out.get(other)
            if prior is None or weight > prior["weight"]:
                out[other] = {"weight": weight, "tx": row.get("hash"),
                              "ts": int(row.get("timeStamp", 0))}

    return out, total_rows >= CFG["high_degree_tx_count"]


# ---------------------------------------------------------------------------

def load_state():
    if STATE.exists():
        return json.loads(STATE.read_text())
    return {"phase": 1, "halo": {}, "terminals": {}, "done": [],
            "pending": [], "calls_used": 0, "level1_total": None}


def save_state(st):
    STATE.write_text(json.dumps(st))


def expand(address, depth, seed, st, seed_set, services):
    """Expand one node. Returns rows for the nodes recorded at depth+1."""
    cps, high_degree = counterparties(address)

    if depth > 0 and (high_degree or len(cps) > CFG["max_fanout_build"] * 8):
        st["terminals"][address] = "high degree"
        return []

    ranked = sorted(cps.items(), key=lambda kv: kv[1]["weight"],
                    reverse=True)[:CFG["max_fanout_build"]]

    added = []
    parent_via = st["halo"][address]["via"] if depth > 0 else [seed]

    for other, edge in ranked:
        if other in seed_set:
            continue
        if other in services:
            st["terminals"][other] = "service entity"
            continue

        distance = depth + 1
        prior = st["halo"].get(other)
        if prior and prior["d"] <= distance:
            continue

        st["halo"][other] = {"d": distance, "seed": seed,
                             "via": [other] + parent_via, "tx": edge["tx"]}
        added.append([other, distance, seed, edge["weight"]])

    return added


def emit(st, seeds):
    by_distance = {}
    for row in st["halo"].values():
        by_distance[row["d"]] = by_distance.get(row["d"], 0) + 1

    level1 = st.get("level1_total")
    done = set(st["done"])
    expanded = sum(1 for a, r in st["halo"].items()
                   if r["d"] == 1 and a in done)

    out = {
        "built_at": datetime.now(timezone.utc).isoformat(),
        "source": "Etherscan, public transaction data",
        "seed_count": len(seeds),
        "counts": by_distance,
        "terminal_count": len(st["terminals"]),
        "coverage": {
            "level1_nodes_found": level1,
            "level1_nodes_expanded": expanded,
            "note": ("Level-one nodes were expanded highest transfer value "
                     "first. Any not expanded contribute no third hop."),
        },
        "rules": {k: CFG[k] for k in
                  ("min_eth", "token_floors", "max_fanout_build",
                   "high_degree_tx_count")},
        "halo": st["halo"],
    }
    (DATA / "halo.json").write_text(json.dumps(out))
    size = (DATA / "halo.json").stat().st_size / 1_000_000

    print(f"\n  distance 1: {by_distance.get(1, 0)}")
    print(f"  distance 2: {by_distance.get(2, 0)}")
    print(f"  terminal:   {len(st['terminals'])}")
    if level1:
        print(f"  coverage:   {expanded} of {level1} level-one nodes expanded")
    print(f"\ndata/halo.json is {size:.1f} MB")
    if size > 40:
        print("Too large for a serverless bundle. Lower max_fanout_build "
              "or raise the floors and rebuild.")


def main():
    args = set(sys.argv[1:])
    seeds_file = json.loads((DATA / "seeds.json").read_text())
    seeds = [r["address"].lower() for r in seeds_file["addresses"]]
    if not seeds:
        sys.exit("data/seeds.json is empty. Run pull_arkham.py seeds first.")

    services = set(json.loads((DATA / "services.json").read_text())["addresses"])
    seed_set = set(seeds)
    st = load_state()
    _calls[0] = st["calls_used"]

    if "--emit" in args:
        emit(st, seeds)
        return

    done = set(st["done"])
    budget = CFG["max_api_calls"]

    try:
        # ── Phase 1: expand every seed ──────────────────────────────────
        if st["phase"] == 1:
            todo = [s for s in seeds if s not in done]
            mins = len(todo) * CALLS_PER_NODE * RATE_LIMIT / 60
            print(f"Phase 1: {len(todo)} seeds, "
                  f"{len(todo) * CALLS_PER_NODE} calls, about {mins:.0f} min\n")

            for i, address in enumerate(todo, 1):
                st["halo"].setdefault(address, {"d": 0, "seed": address,
                                                "via": [address], "tx": None})
                st["pending"] += expand(address, 0, address, st,
                                        seed_set, services)
                done.add(address)

                if i % 25 == 0:
                    st["done"], st["calls_used"] = list(done), _calls[0]
                    save_state(st)
                    print(f"  {i}/{len(todo)} seeds | "
                          f"{len(st['pending'])} level-one hits | "
                          f"{_calls[0]} calls")

            # Deduplicate. Many seeds share consolidation wallets, and how far
            # they overlap is the whole question phase one exists to answer.
            best: dict[str, list] = {}
            for row in st["pending"]:
                addr, weight = row[0], row[3]
                if addr not in best or weight > best[addr][3]:
                    best[addr] = row
            st["pending"] = sorted(best.values(), key=lambda r: -r[3])
            st["level1_total"] = len(st["pending"])
            st["phase"] = 2
            st["done"], st["calls_used"] = list(done), _calls[0]
            save_state(st)

            projected = st["level1_total"] * CALLS_PER_NODE
            remaining = budget - _calls[0]
            print(f"\nPhase 1 complete. {_calls[0]} calls used.")
            print(f"  {st['level1_total']} distinct level-one nodes")
            print(f"  phase 2 would cost {projected} calls, "
                  f"about {projected * RATE_LIMIT / 3600:.1f} hours")
            print(f"  budget remaining: {remaining} calls")
            if projected > remaining:
                covered = remaining // CALLS_PER_NODE
                pct = 100 * covered / max(st["level1_total"], 1)
                print(f"  budget covers {covered} of them ({pct:.0f}%), "
                      f"highest value first")

            if "--yes" not in args:
                print("\nRerun with --yes to start phase 2.")
                emit(st, seeds)
                return

        # ── Phase 2: expand level-one nodes, highest value first ────────
        print(f"\nPhase 2: {len(st['pending'])} nodes queued, "
              f"{budget - _calls[0]} calls of budget left\n")

        processed = 0
        while st["pending"]:
            if _calls[0] + CALLS_PER_NODE > budget:
                print(f"\nCall budget reached at {_calls[0]} calls. "
                      f"{len(st['pending'])} nodes left unexpanded.")
                break

            address, depth, seed, _weight = st["pending"][0]
            if address in done:
                st["pending"].pop(0)
                continue

            expand(address, depth, seed, st, seed_set, services)
            done.add(address)
            st["pending"].pop(0)
            processed += 1

            if processed % 25 == 0:
                st["done"], st["calls_used"] = list(done), _calls[0]
                save_state(st)
                left = (budget - _calls[0]) // CALLS_PER_NODE
                print(f"  {processed} expanded | {len(st['halo'])} mapped | "
                      f"{_calls[0]} calls | {left} nodes of budget left")

    finally:
        st["done"], st["calls_used"] = list(done), _calls[0]
        save_state(st)
        emit(st, seeds)


if __name__ == "__main__":
    main()
