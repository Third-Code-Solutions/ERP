# No-license CI secret scan

The GitHub `Secret Scan` job no longer invokes the paid-license-required
`gitleaks/gitleaks-action`. It now runs the repository's existing
`scripts/run-gitleaks.mjs`, which downloads the pinned Gitleaks 8.30.1 release
with a platform checksum and scans the complete repository history. The
workflow action-reference validator was updated to match.

Local Gitleaks and Actionlint checks remain green. This change does not alter
production data, provider settings, or deployment behavior.
