"""CI fixture: crypto that must NOT trip a `broken-classical` gate.

The negative fixture proves the gate fails on broken crypto. This one proves it does not
fail on everything - a gate that rejects all input is as useless as one that accepts all
input, and only the pair distinguishes them.

Deliberately includes quantum-VULNERABLE-but-not-classically-broken primitives (RSA, ECDSA).
Those are real findings at other risk levels, and they must still not trigger `fail-on:
broken-classical`, or the gate's severity filter is decorative.
"""

import hashlib
import hmac


def fingerprint(payload: bytes) -> str:
    """SHA-512: not broken, not quantum-broken (Grover halves the margin, 256 bits remain)."""
    return hashlib.sha512(payload).hexdigest()


def tag(key: bytes, payload: bytes) -> str:
    return hmac.new(key, payload, hashlib.sha512).hexdigest()


AEAD = "AES-256-GCM"          # quantum-weakened at worst, not broken
TRANSPORT = "TLSv1.3"         # must not match the TLS<1.2 rule
KEM = "ML-KEM-1024"           # FIPS 203, quantum-resistant
SIGNATURE = "ML-DSA-87"       # FIPS 204, quantum-resistant

# Quantum-broken but NOT classically broken: these must be reported and must NOT fail
# a `broken-classical` gate.
LEGACY_PUBKEY = "RSA-4096"
LEGACY_ECC = "ECDSA-P384"
