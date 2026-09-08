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
# any address they liked while the intent targeted another one. The oracle's
# answer only counts if it is about the address this transaction touches.

deny contains "screened address does not match the intent" if {
	data.wasm.screened
	lower(data.wasm.wallet) != lower(input.to)
}

# ── Exposure ────────────────────────────────────────────────────────────────

deny contains "wallet is a known Lazarus Group address" if {
	data.wasm.direct_match
}

# max_hops is what makes the distance a policy decision rather than a fact of
# the chain. At 3 any traced exposure blocks; at 2 a three-hop wallet passes;
# at 1 only direct dealings block. The graph result does not change, the rule
# applied to it does.
deny contains sprintf("%d-hop Lazarus exposure", [data.wasm.hop_count]) if {
	data.wasm.exposure
	not data.wasm.direct_match
	data.wasm.hop_count <= data.params.max_hops
}
