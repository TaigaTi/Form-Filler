# 0002 — Extension state uses `chrome.storage.local`

Date: 2026-06-02
Status: Accepted

## Principle

All extension state — both ephemeral per-fill results and user preferences — is
persisted to **`chrome.storage.local`**, never `chrome.storage.sync`. New state
added in future work uses `local` unless a deliberate, documented case for
cross-device sync is made.

## Context

The fill flow writes state on every fill: `lastFillResult` and `invalidCycleStep`
are updated each time the user fills a form, and `testValidationMode` toggles the
invalid-data mode. These were originally kept in `chrome.storage.sync`.

`storage.sync` is the wrong area for this:

- It is rate-limited (`MAX_WRITE_OPERATIONS_PER_MINUTE`, ~120/min, plus per-item
  write limits). Rapid repeated fills — exactly how this tool is used during
  testing — can hit the throttle and silently drop writes.
- It pushes state to every machine the user is signed into. This is a
  single-machine testing/QA tool; a per-device "last fill" timestamp or an
  invalid-mode cycle counter has no meaning on another device.

## Decision

Move all settings (`lastFillResult`, `invalidCycleStep`, `testValidationMode`) to
`chrome.storage.local`. Keys are unchanged; only the storage area differs. The one
user-visible effect is that the Test Validation Mode toggle no longer follows the
user across machines — acceptable for a debug toggle, and it keeps `getSettings`
reading from a single area.

## Consequences

- No risk of sync write-throttling on the hot fill path.
- One read/write path (`storage.local`) for all state — no split across areas.
- If a future feature genuinely needs a preference to sync across devices, that is
  a deliberate reversal of this decision for that specific key, documented as such —
  not a default.
