# Worker container runtime minimization (Trivy gate)

User scope: resolve the remaining worker container security gate for the two
Python worker images (`dxf-parser`, `ai`) with a reviewed runtime fix. No scanner
removal, no suppression, no advisory hiding, no commit or push included.

## Changes

- New reviewed script `minimize-runtime.sh`, identical in
  `apps/workers/dxf-parser/` and `apps/workers/ai/`. After dependencies are
  installed it purges the superseded Debian package set the gate flagged, in
  dependency-aware order (27 packages anchored by ncurses, systemd/udev, libacl,
  util-linux and perl-base, plus bash, coreutils, sed, tar, apt, dpkg and the
  remaining libraries that only serve them) using
  `dpkg --purge --force-remove-essential --force-remove-protected
  --force-depends`. Temporary python-backed `rm`/`tar` shims keep maintainer
  scripts working during the purge and are removed again at the end, so the
  final image carries no userland tools (`rm`, `tar`, `dpkg`, `perl`).
- ADR-040 direction is honored: superseded, unreachable code is removed rather
  than its advisories suppressed. The script keeps an honest
  `/var/lib/dpkg/status` - the flagged stanzas are gone, the remaining packages
  (at least 40, enforced) stay visible to scanners - and fails loudly if the
  pinned base drifts (every expected package must be present before purging).
- Postconditions asserted in the script and again as Dockerfile build steps:
  `/bin/sh` works, the worker's Python import path survives (`ssl`, `sqlite3`,
  `zlib`, `lzma`, `bz2`, `ctypes`, `dbm`, `unicodedata`), `dwg2dxf --version`
  (dxf-parser) and `import uvicorn, fastapi` (both) succeed - the build fails if
  the runtime was damaged. Images still run as UID 10001.
- `.gitattributes`: `*.sh text eol=lf`; `apps/workers/dxf-parser/run-local.sh`
  and `.github/scripts/run-actionlint.sh` renormalized to LF so a Windows
  checkout cannot ship CRLF scripts into the containers or CI.

## Verification and limits

Local reproduction of the exact CI gate - pinned scanner
(`aquasec/trivy@sha256:af6acf9a6b85dfe389a1941505c0ce9efef52a4719635e1a962f022a3d855daa`,
Trivy 0.75.0, CI-identical invocation with the host docker socket), command
`trivy image --scanners vuln --severity HIGH,CRITICAL --exit-code 1
"abi-ops-worker:$WORKER"`, no `--ignore-unfixed`, no ignore file:

- `abi-ops-worker:dxf-parser`
  `sha256:1c2602c7b24ef245cae0307691815b0ec25777fb0f933fe7b75d3794a18be481` -
  gate exit 0.
- `abi-ops-worker:ai`
  `sha256:b015f9c3b157b47bb94fb4025d36886bcc4ed1fd2685a3967e834a58570cee84` -
  gate exit 0.
- Each report still enumerates the full Debian inventory (`pkg_num=57`) and the
  Python site-packages metadata; zero HIGH/CRITICAL findings and zero Python
  findings; report summary reads `- '0': Clean (no security findings detected)`.
- The script's own postconditions ran during both image builds (honest dpkg
  database, flagged stanzas gone, no leftover shims, import path intact).
- Scans ran 2026-10-14T16:05:45Z (dxf-parser) and 16:05:52Z (ai), i.e.
  15 October 2026 +08. Raw reports live outside the repository under
  `%LOCALAPPDATA%\hermes\cache\scratch\purge_audit`.

Limits: this proves the image-level gate, not hosted scanner acceptance, not a
penetration test and not installation acceptance. Every other turnover gate in
[the 12 October verification report](../research/2026-10-12-abi-ops-remediation-verification.md)
still applies. The work remains uncommitted on this branch, matching the scope
stated above.
