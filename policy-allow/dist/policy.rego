package allow_all

import rego.v1

# Allows every wallet. This is not a control. It is deployed next to the
# Lazarus exposure policy so the demo can show that Newton Protocol operators
# enforce whatever the chosen policy says: same operators, same attestation,
# a rule that lets everything through.
default allow := true
