"""CI fixture: deliberately broken classical crypto.

This file exists so the policy gate has something to fail on. It is NOT example code and
must never be copied. Every primitive here is broken and is flagged `broken-classical`
by the scanner's RULES table.

The gate grades on `gradeContext: 'code'` - a comment mentioning MD5 is deliberately not a
finding - so these have to be real call sites, not prose.
"""

import hashlib
import hmac


def legacy_fingerprint(payload: bytes) -> str:
    """MD5: collision-broken since 2004."""
    return hashlib.md5(payload).hexdigest()


def legacy_signature(key: bytes, payload: bytes) -> str:
    """SHA-1: SHAttered (2017), chosen-prefix collisions (2020)."""
    return hmac.new(key, payload, hashlib.sha1).hexdigest()


LEGACY_CIPHER = "3DES"          # Sweet32; 64-bit block
LEGACY_STREAM = "RC4"           # biased keystream
LEGACY_TRANSPORT = "TLSv1.0"    # below TLS 1.2
