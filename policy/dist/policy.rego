package lazarus_exposure

import rego.v1

# Deny by default. Every path to allow has to be reached explicitly.
default allow := false

allow if count(deny) == 0

# ── Fail closed ─────────────────────────────────────────────────────────────
# If the graph could not be traced, the wallet was not screened, and an
# unscreened wallet is not a clean one. This is the rule that keeps a screening
# failure from being reported as a pass.

deny contains "screening did not complete" if {
	not data.wasm.screened
}

# ── Bind the screening to the intent ────────────────────────────────────────
# wasm_args are supplied by the caller, so without this a caller could screen
# any address they liked while the intent targeted another one.

deny contains "screened address does not match the intent" if {
	data.wasm.screened
	lower(data.wasm.wallet) != lower(input.to)
}

# ── Exposure ────────────────────────────────────────────────────────────────
# A known address is denied outright. Distance and value do not apply: the
# wallet is the entity, not something adjacent to it.

deny contains "wallet is a known Lazarus Group address" if {
	data.wasm.direct_match
}

# Indirect exposure has to clear both dials to be denied. Distance says how far
# the connection is; value says how much moved along it. A wallet three hops out
# on a $30 transfer is a different proposition from one three hops out on $5m,
# and a policy that cannot tell them apart is not much of a control.
deny contains sprintf("%d-hop Lazarus exposure of $%.0f", [data.wasm.hop_count, data.wasm.exposure_usd]) if {
	data.wasm.exposure
	not data.wasm.direct_match
	data.wasm.hop_count <= data.params.max_hops
	data.wasm.exposure_usd >= data.params.min_exposure_usd
}
