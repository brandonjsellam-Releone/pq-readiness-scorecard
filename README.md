# Post-Quantum Readiness Scorecard

**Scan your repository for quantum-vulnerable cryptography, get an A–F readiness grade + a CycloneDX 1.6 CBOM
(Cryptographic Bill of Materials), and optionally fail the build on broken crypto — in one CI step, no install.**

Regulators are starting to require a cryptographic inventory (CNSA 2.0, DORA, NIS2, EU CRA). This Action produces
that inventory automatically on every push. Free and open-source (MIT). Zero dependencies — the scanner is vendored.

> Prefer to try it in your browser first (nothing uploaded)? → **https://throndar.ai/cbom**

## Usage

```yaml
# .github/workflows/pqc-readiness.yml
name: PQC readiness
on: [push, pull_request]
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
      - uses: brandonjsellam-Releone/pq-readiness-scorecard@v1
        with:
          path: .
          fail-on: broken-classical      # fail the build on classically-broken crypto
          strict: true                   # gating workflow: ignore any in-tree .pqcbomignore (see below)
          # min-grade: B                  # optional: fail below this grade
```

## Inputs

| Input | Default | Description |
|---|---|---|
| `path` | `.` | Directory to scan |
| `fail-on` | `broken-classical` | Comma-separated risk classes that fail the build (`broken-classical,quantum-broken,quantum-weakened`) |
| `min-grade` | `` (off) | Fail below this grade (A–F) |
| `exclude` | `` (off) | Comma-separated path globs to skip (e.g. `test-fixtures/,examples/`). Also readable from `.pqcbomignore` lines containing `/`. Excluded paths are **counted in the step summary, never silently dropped**. |
| `strict` | `false` | Ignore the in-tree `.pqcbomignore` entirely. **Set this on any workflow that gates a build** — see [Scan suppression is a supply-chain surface](#scan-suppression-is-a-supply-chain-surface). `exclude` still applies. |

The step summary also flags **harvest-now-decrypt-later** urgency: key-establishment findings (KEM/DH/ECDH and RSA
*key transport* such as RSA-OAEP or static-RSA TLS suites) are the most time-urgent migrations — recorded ciphertext
is decryptable once a cryptographically-relevant quantum computer exists — while signature findings are forge-later.
Hardcoded JWT/JOSE tokens are decoded (header segment only, never the payload) and classified by their `alg`.

## Outputs

| Output | Description |
|---|---|
| `grade` | Post-Quantum Readiness grade (A–F) |
| `score` | Score 0–100 |
| `sarif-file` | SARIF 2.1.0 report — upload with `github/codeql-action/upload-sarif` to see findings in the **Security** tab |
| `cbom-file` | `cbom.cdx.json` — CycloneDX 1.6 CBOM |

## What it detects

RSA / ECDSA / ECDH / DH / EC curves (quantum-broken by Shor) · AES-128/192, SHA-256/384 (quantum-weakened by
Grover) · MD5 / SHA-1 / RC4 / 3DES / Blowfish / deprecated TLS / NTLM / WEP (classically broken) · X25519 / Ed25519
(flagged as valid *hybrid* legs) · ML-KEM / ML-DSA / SLH-DSA / Falcon / XMSS / AES-256 / SHA-512 / ChaCha20
(quantum-resistant). It also flags **broken PQ candidates** — SIKE/SIDH (Castryck–Decru 2022) and GeMSS — so a
project that *thinks* it migrated isn't left with a false sense of safety. Reads declared crypto libraries, numeric
OIDs (certs/ASN.1), and base64/PEM key/cert blobs too.

## Scan suppression is a supply-chain surface

The suppression mechanisms — the `.pqcbomignore` file and inline `pqcbom-ignore` markers — live **inside the tree
being scanned**. In the deployment this Action is designed for (`on: [push, pull_request]`, gating the build), that
tree *is* the code under review. A pull request can therefore ship its own suppression policy alongside the code it
wants hidden: adding `path: src/crypto/` or a bare `MD5` line to `.pqcbomignore` silences findings about the very
change being reviewed, and the gate goes green. This is the standard in-tree-config problem that affects every SAST
tool with a repo-local ignore file — but you should know it applies here, not discover it after a bad merge.

Two mitigations, both on by default or one line away:

**1. Suppression is never silent.** Every run prints a **Suppression disclosure** section to the console *and* the job
step summary — unconditionally, even when nothing is suppressed, so its absence is itself a red flag. It lists every
active rule with the **source it came from** (`.pqcbomignore` vs. the workflow's own `exclude` input), every path the
scan skipped, every finding the algo/risk allowlist dropped, and the `file:line` of every inline `pqcbom-ignore`
marker — plus the total count of suppressed occurrences. If a `.pqcbomignore` inside the scanned tree suppressed
anything, the run also emits a `::warning::` annotation, visible on the check itself.

**2. `strict: true` disables the in-tree ignore file.** On a gating workflow, set it:

```yaml
      - uses: brandonjsellam-Releone/pq-readiness-scorecard@v1
        with:
          fail-on: broken-classical
          strict: true                        # .pqcbomignore in the scanned tree is ignored entirely
          exclude: test-fixtures/,examples/   # legitimate excludes now live in the WORKFLOW, not in the PR
```

The `exclude` input still works under `strict`, because it is set in the workflow file — which a pull request from a
fork cannot change, and which an in-repo change modifies visibly, under whatever branch protection you already have.
Move your legitimate excludes there and the gate can no longer be silenced by the diff it is judging.

Inline `pqcbom-ignore` markers are still honored under `strict` (they sit on the exact line of the finding, so they
are visible in the diff), but every one of them is listed by `file:line` in the disclosure. `strict` defaults to
`false` so that non-gating, informational scans keep the adoption escape hatch.

## Honest posture

Lexical scan — findings are **leads to verify, not a complete inventory** and **not a certification**. Algorithm
names denote the public standards they're based on, not a CMVP/FIPS-140 validation. It won't fake a clean bill of
health: a scan that examines zero files refuses to grade rather than reporting "A". Falcon is FN-DSA for the
forthcoming FIPS 206 (in development), not yet standardized.

## Need a signed, auditor-ready report?

An **Evidence Pack** turns the scan into a cryptographically signed, independently-verifiable deliverable (exec
summary + grade + findings + CBOM + migration plan) that your auditors can verify offline. → **https://throndar.ai/evidence**

## License

MIT © TRELYAN Inc. The scanner is open-source; read it, re-run it, verify every finding yourself.
