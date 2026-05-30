# 0001 — Local-only fake-data generation

Date: 2026-05-30
Status: Accepted (supersedes the earlier Claude AI-fallback design)

## Principle

All fake-data generation happens **locally and deterministically** — no network
calls, no API keys, no external services in the fill or error-correction path. New
field coverage is added as faker-backed rules and heuristics, not remote calls.

## Context

The extension previously fell back to the Claude API (with a per-user API key) for
fields whose label matched no rule. Investigation this session showed the AI path was
marginal: it only fired when `generateValue` returned null, whatever it didn't return
already fell through to local generation, and on the target gov-bb forms (minimal DOM,
no `pattern` attributes) it couldn't use the constraints it was prompted to respect.
It also wasn't wired into the validation-error correction loop, where adherence
actually matters.

A shared/bundled key behind Chrome Web Store domain restriction was considered and
rejected: a bundled key is extractable by anyone who installs the extension, so it
would expose the org's Anthropic billing to power a low-value feature.

## Decision

Remove the AI fallback and API key entirely. Cover more fields with faker — expanded
label rules plus a long-form heuristic — and use a period-free word filler as the
absolute fallback.

## Consequences

- No secret to manage, store, or rotate; smaller permission surface (no host
  permission); no latency on the fill path.
- Improving coverage means adding/adjusting faker rules and heuristics, not calling a
  model. If a future need genuinely requires non-local generation, it must be raised
  as a deliberate reversal of this decision (and must not bundle a client-side secret).
- Quality of unmatched free-text fields is bounded by faker + routing rather than a
  model's contextual guess — an accepted trade for zero setup and zero secret risk.
