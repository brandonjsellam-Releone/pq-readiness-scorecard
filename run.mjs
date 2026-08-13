/*! TRELYAN Post-Quantum Readiness Scorecard — GitHub Action runner. Scans the repo, emits a CycloneDX CBOM + grade,
 *  writes the shields badge endpoint, sets outputs/step-summary, and fails the build per policy. */
import { scanDirectory, toCycloneDX, toSARIF } from './pqcbom.mjs';      // vendored (zero-dep) — see vendor.sh
import { scorecardBadge, policyGate } from './action-lib.mjs';           // zero-dep subset of pqcbom-server (no @noble)
import { writeFileSync, appendFileSync } from 'fs';

const path = process.env.INPUT_PATH || '.';
const failOn = (process.env['INPUT_FAIL-ON'] ?? 'broken-classical').split(',').map((s) => s.trim()).filter(Boolean);
const minGrade = (process.env['INPUT_MIN-GRADE'] || '').trim();
const excludePaths = (process.env.INPUT_EXCLUDE || '').split(',').map((s) => s.trim()).filter(Boolean); // v0.10 path excludes (also honored from .pqcbomignore path lines)
// v0.14 `strict`: ignore the in-tree `.pqcbomignore` entirely. That file is read from INSIDE the scanned tree, so in a
// gating `on: [push, pull_request]` workflow its contents are supplied by the code under review — an untrusted change
// can add path-exclude/allowlist lines that silence findings about itself. `exclude` (set in the workflow, not in the
// reviewed tree) still applies under strict. Off by default: adoption keeps the escape hatch, gates opt in.
const strict = /^(1|true|yes|on)$/i.test((process.env.INPUT_STRICT || '').trim());

// CI gate grades on CODE occurrences (a comment that mentions "MD5" should not fail a build); the full report still
// lists comment/doc mentions as 'informational'. (A one-time assessment uses the conservative total-count default.)
const r = await scanDirectory(path, { gradeContext: 'code', excludePaths, noIgnoreFile: strict });
writeFileSync('cbom.cdx.json', JSON.stringify(toCycloneDX(r), null, 2));
writeFileSync('pq-readiness-badge.json', JSON.stringify(scorecardBadge(r.grade)));
// SARIF for GitHub code-scanning — findings appear in the Security tab + as inline PR annotations (paths repo-relative)
writeFileSync('pqcbom.sarif', JSON.stringify(toSARIF(r, { baseDir: path }), null, 2));

if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `grade=${r.grade.letter}\nscore=${r.grade.score}\nsarif-file=pqcbom.sarif\ncbom-file=cbom.cdx.json\n`);
const bc = r.summary.by_confidence || { likely: 0, lead_to_verify: 0, informational: 0 };
const hndl = r.findings.filter((f) => f.hndl); // v0.11: harvest-now-decrypt-later — migrate these first
const hndlLine = hndl.length ? `\n\n⏳ **Harvest-now-decrypt-later:** ${hndl.reduce((n, f) => n + (f.count || 1), 0)} key-establishment occurrence(s) (${[...new Set(hndl.map((f) => f.algo))].join(', ')}) — recorded ciphertext is decryptable once a CRQC exists; migrate these FIRST.` : '';
const summary = `## 🛡️ Post-Quantum Readiness Scorecard: ${r.grade.letter} (${r.grade.score}/100)\n\n**${r.grade.label}** — ${r.summary.files_scanned} files, ${r.summary.distinct_algorithms} algorithms\n\n| risk | count |\n|---|---|\n| ⛔ broken-classical | ${r.summary.broken_classical} |\n| 🔴 quantum-broken | ${r.summary.quantum_broken} |\n| 🟡 quantum-weakened | ${r.summary.quantum_weakened} |\n| 🔵 classical (hybrid-ok) | ${r.summary.classical_hybrid_ok} |\n| 🟢 quantum-resistant | ${r.summary.quantum_safe} |\n\n**Confidence** (tool-derived): 🟢 likely (declared dependency) ${bc.likely} · 🟡 lead-to-verify (in code) ${bc.lead_to_verify} · ⚪ informational (comment/doc) ${bc.informational}${hndlLine}${r.summary.suppressed ? `\n\n_${r.summary.suppressed} occurrence(s) suppressed via inline \`pqcbom-ignore\` / \`.pqcbomignore\` (accepted, not graded)._` : ''}${r.summary.excluded_paths ? `\n\n_${r.summary.excluded_paths} path(s) excluded via the \`exclude\` input / \`.pqcbomignore\` path lines (scan narrowed — counted, never silent)._` : ''}${r.summary.skipped_outputs ? `\n\n_${r.summary.skipped_outputs} pqcbom output artifact(s) skipped (a scan never re-ingests its own reports)._` : ''}\n\nTwo-layer scan (inline patterns + dependency manifests). Findings are leads to verify, not a complete inventory. Artifacts: \`cbom.cdx.json\` (CycloneDX CBOM), \`pqcbom.sarif\` (upload to GitHub code-scanning to see findings in the Security tab).\n`;
// ── SUPPRESSION DISCLOSURE ────────────────────────────────────────────────────────────────────────────────────────
// Printed UNCONDITIONALLY (even when nothing is suppressed) so its absence is itself a red flag. Suppression rules can
// come from the scanned tree's own `.pqcbomignore`, so a reviewer must be able to see every active rule, where it came
// from, and exactly what it silenced — without opening the PR's files.
const sup = r.summary.suppression || {};
const rules = sup.rules || [], inlineSites = sup.inline_sites || [], allowHits = sup.allowlist_hits || [];
const exSamples = sup.excluded_path_samples || [], igf = sup.ignore_file || {};
const nSuppressed = r.summary.suppressed || 0, nExcluded = r.summary.excluded_paths || 0;
const cap = (arr, n, render) => arr.slice(0, n).map(render).join('\n') + (arr.length > n ? `\n- …and ${arr.length - n} more` : '');
// Rule patterns and paths are attacker-controlled text rendered into the job step summary — neutralise the characters
// that would let a crafted `.pqcbomignore` line break out of the code span / table cell and forge summary markup.
const md = (v) => String(v).replace(/[\r\n]+/g, ' ').replace(/[`|]/g, '␣').slice(0, 200);
let disclosure = `\n### 🔎 Suppression disclosure\n\n`
  + `- **Strict mode:** ${strict ? '**ON** — the in-tree `.pqcbomignore` is ignored; only the workflow\'s own `exclude` input applies' : 'off — the in-tree `.pqcbomignore` is honored (set `strict: true` on a gating workflow)'}\n`
  + `- **In-tree \`.pqcbomignore\`:** ${igf.present ? (igf.honored ? '⚠️ present and **honored** — these rules were supplied by the scanned tree itself' : 'present but **ignored** (strict mode)') : 'not present'}\n`
  + `- **Occurrences suppressed:** ${nSuppressed} · **paths excluded:** ${nExcluded}\n\n`;
disclosure += rules.length
  ? `**Active suppression rules (${rules.length}):**\n\n| kind | pattern | source |\n|---|---|---|\n${rules.map((x) => `| ${md(x.kind)} | \`${md(x.pattern)}\` | ${md(x.source)} |`).join('\n')}\n`
  : `**Active suppression rules:** none.\n`;
if (exSamples.length) disclosure += `\n**Paths excluded from the scan:**\n${cap(exSamples, 25, (p) => `- \`${md(p)}\``)}\n`;
if (allowHits.length) disclosure += `\n**Findings dropped by the algo/risk allowlist:**\n${cap(allowHits, 25, (h) => `- \`${md(h.algo)}\` (${md(h.risk)}) ×${h.count} in \`${md(h.file)}\` — rule \`${md(h.rule)}\``)}\n`;
if (inlineSites.length) disclosure += `\n**Lines silenced by an inline \`pqcbom-ignore\` marker:**\n${cap(inlineSites, 25, (s) => `- \`${md(s.file)}\`:${s.line}`)}\n`;

if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + disclosure);
console.log(summary + disclosure);
// A gate that can be silenced from inside the reviewed tree gets a visible annotation on the check, not just a log line.
if (!strict && igf.honored && (nSuppressed || nExcluded)) {
  console.log(`::warning::PQ Readiness: ${nSuppressed} occurrence(s) suppressed and ${nExcluded} path(s) excluded by a .pqcbomignore inside the scanned tree. On a gating workflow set \`strict: true\` so scan-suppression cannot be supplied by the code under review.`);
}

if (failOn.length || minGrade) {
  const gate = policyGate(r, { failOn, minGrade: minGrade || undefined });
  if (!gate.pass) { console.error('::error::PQ Readiness gate failed: ' + gate.violations.join('; ')); process.exit(1); }
  console.log('PQ Readiness gate: PASS');
}
