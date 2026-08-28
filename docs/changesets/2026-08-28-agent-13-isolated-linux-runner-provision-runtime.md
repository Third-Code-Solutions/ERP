# Agent 13 — isolated Linux Provision runtime attempt

**Date:** 2026-08-28
**Reviewed helper candidate:** `b1398956d3cc43dc5085dd351087616224db9669`
**Acceptance reviewed:** `393fc3c14d52180e530f2925e02c4d91c55d8314`
**Result:** **NO-GO — stopped before Provision mutation.**

## Read-only and input evidence

- Group `3` is still `erp-ci-isolated`, non-default and `selected`, with
  `restricted_to_workflows=true`, exactly one selected repository
  `Third-Code-Solutions/ERP`, exactly one selected workflow
  `Third-Code-Solutions/ERP/.github/workflows/ci-linux-runner-smoke.yml@827719975eb44808da85cbd64cc28074f6ee4ae1`, and zero runners.
- The reviewed helper files were unchanged from `b1398956`; current HEAD only
  added Agent 12's acceptance record. The pre-existing untracked `.tools/`
  directory was not touched.
- The approved archive was initially absent. Under the acceptance's fixed-path
  exception, it was downloaded only from
  `https://cloud-images.ubuntu.com/noble/20260826/noble-server-cloudimg-amd64-azure.vhd.tar.gz`
  to `D:\third-code-erp-isolated-runner-cache\noble-server-cloudimg-amd64-azure.vhd.tar.gz`.
  Its official dated `SHA256SUMS` line and local SHA-256 both equal
  `843d243792abb05b50e1a7f5e614e1184d8fc7195c119747cbb3038520258a22`
  (603,960,567 bytes). No alternative archive, URL, cache path, or checksum was used.
- Before UAC, the exact run identity
  `third-code-erp-ci-20260828-provision1` had no VM, switch, NAT, run root,
  static NAT mapping, netsh port proxy, or protected-port listener. The
  unrelated `nginx-test` Docker resource was observed but not changed.

## One visible elevated attempt

One visible UAC process invoked only the reviewed helper with:

```text
powershell.exe -NoProfile -ExecutionPolicy Bypass -File
D:\thirdcode\ERP-recovery-20260827\scripts\ci\invoke-isolated-linux-runner-host.ps1
-Mode Provision -RunIdentity third-code-erp-ci-20260828-provision1
-LedgerPath D:\thirdcode\ERP-recovery-20260827\tmp\isolated-linux-runner-third-code-erp-ci-20260828-provision1-runtime-ledger.json
-ProvisionAuthorization I_ACKNOWLEDGE_ISOLATED_RUNNER_PROVISION
```

The process exited `1`. The non-secret ledger above records:

```text
Cannot bind argument to parameter 'Lines' because it is an empty string.
```

Root cause is in the reviewed preflight path: `Get-PortProxyEntries` passes an
empty `netsh interface portproxy show` collection into
`ConvertTo-PortProxyEntries` whose mandatory `[string[]] $Lines` parameter does
not accept the empty result. The failure occurred while creating the initial
host inventory, before `Invoke-Provision` writes an ownership ledger or creates
any run-owned resource.

## Post-failure readback

- Runtime ledger: `SchemaVersion=2`, `Mode=Provision`, `Outcome=FAIL`; it has
  no Provisioning, Provisioned, evidence, guest, VHD(X), VM, switch, NAT, ACL,
  mapping, proxy, Docker, or runner record.
- Exact target re-inventory confirms no target VM, switch, NAT, run root,
  static NAT mapping, netsh port proxy, or protected Supabase-port listener.
  Since mutation never began, no staged rollback was needed; the same zero
  residue result is independently proven by the post-failure inventory.
- The immutable archive remains at the approved cache path and retains the
  verified SHA-256. No guest evidence disk/hash exists because no guest was
  created.

No retry was attempted. No JIT/runner registration, workflow/group mutation,
dispatch, credential/Auth/Snyk, database/provider, deployment, or production
action occurred.

→ **Handoff to Agent 12.** Runtime defect in the reviewed helper requires a
minimal code repair and new static review before another Provision attempt. The
release remains **NO-GO**.

## Minimal runtime repair — pending Agent 12 re-review

This repair changes only the reproduced `netsh portproxy` empty-output parser
defect. It does not invoke UAC or Provision, retry the prior target, download
another archive, or change a host, group, runner, credential, Auth, provider,
database, or production resource.

- `ConvertTo-PortProxyEntries` now accepts a null collection, empty collection,
  and the Windows `netsh` no-proxy output of one empty string as the valid zero
  proxy state. This is the exact state observed on this host.
- Any nonempty mapping still parses into an entry and is rejected by the
  unchanged global `Assert-NoMappingsOrPortProxies` gate. Any malformed
  nonempty `netsh` line or out-of-range port fails the helper closed before
  Provision.
- Added a non-elevated `PortProxyRegression` mode and Node contract coverage.
  Both Windows PowerShell 5.1 and pwsh prove empty collection/string/null
  input yields zero entries, a valid mapping is rejected by the global
  zero-proxy assertion, and malformed output is rejected.

| Check | Result |
| --- | --- |
| PowerShell parser — Windows PowerShell 5.1 | **PASS** |
| PowerShell parser — pwsh | **PASS** |
| Direct `PortProxyRegression` — Windows PowerShell 5.1 | **PASS** |
| Direct `PortProxyRegression` — pwsh | **PASS** |
| Node 22 `pnpm test:isolated-linux-runner-contract` | **PASS** — 8/8 |
| `pnpm ci:actionlint` | **PASS** — actionlint 1.7.12 checksum verified |
| `pnpm verify:workflow-action-refs` | **PASS** — four existing pinned refs resolve |
| `pnpm ci:gitleaks` | **PASS** — 1,611 commits / 38.73 MB; no leaks |
| `git diff --check` | **PASS** |

→ **Handoff to Agent 12.** Review the next code commit before authorizing any
second elevated Provision attempt. The previous target was never provisioned;
the archive cache remains the only persistent artifact. Release is **NO-GO**.

## Native `netsh` exit-status repair after Agent 12 review `87a9c0cd` — pending static review

Agent 12 rejected the initial empty-output parser repair because the real
`netsh` invocation redirected stderr and did not evaluate `$LASTEXITCODE`.
Accordingly, a command failure with blank stdout could have been misclassified
as the valid zero-proxy state. This follow-up changes only that fail-open path.

- `Invoke-PortProxyShow` now invokes each exact `netsh interface portproxy show
  <protocol>` command, captures `$LASTEXITCODE` immediately, and throws on any
  nonzero exit before parsing. An ErrorRecord on stderr also throws.
- `Get-PortProxyEntries` consumes an explicit `{ ExitCode, Stdout, Stderr }`
  result and independently rejects incomplete, nonzero, or stderr-bearing
  results before it permits the existing empty-output zero state.
- The non-elevated regression injects exit-zero blank, valid, malformed, and
  out-of-range outputs plus exit-nonzero blank/nonblank and stderr cases. A
  valid mapping still reaches the unchanged global zero-proxy guard and is
  rejected there.
- This was static verification only. There was no UAC prompt, Provision retry,
  download, host mutation, Group 3/workflow change, runner/JIT action,
  credential/Auth/Snyk, database/provider, deployment, or production action.

| Check | Result |
| --- | --- |
| PowerShell parser — Windows PowerShell 5.1 | **PASS** |
| PowerShell parser — pwsh | **PASS** |
| Direct `PortProxyRegression` — Windows PowerShell 5.1 | **PASS** — zero/proxy/error cases |
| Direct `PortProxyRegression` — pwsh | **PASS** — zero/proxy/error cases |
| Node 22 `pnpm test:isolated-linux-runner-contract` | **PASS** — 8/8 |
| `pnpm ci:actionlint` | **PASS** — actionlint 1.7.12 checksum verified |
| `pnpm verify:workflow-action-refs` | **PASS** — four existing pinned refs resolve |
| `pnpm ci:gitleaks` | **PASS** — 1,613 commits / 38.74 MB; no leaks |
| `git diff --check` | **PASS** |

→ **Handoff to Agent 12.** Review the native-command exit/status guard before
authorizing any new elevated Provision attempt. The first target remains clean,
and the release remains **NO-GO**.

## Second guarded elevated Provision attempt — failed closed

**Reviewed candidate:** `08b639511d7f1de220f39b5ec6c5dd2ec6b0c91f`
**Agent 12 authorization:** `651885354c1c308017fa92dea21fdffb7eb0ee00`
**Run identity:** `third-code-erp-ci-20260828-provision2`
**Result:** **NO-GO — no retry authorized.**

Before the one visible elevated attempt, read-only checks confirmed that Group
`3` remained non-default, selected only for `Third-Code-Solutions/ERP`,
`restricted_to_workflows=true`, selected only
`Third-Code-Solutions/ERP/.github/workflows/ci-linux-runner-smoke.yml@827719975eb44808da85cbd64cc28074f6ee4ae1`,
and had zero runners. The new per-run root and ledger did not exist, the helper
code matched the accepted candidate, and the immutable archive's SHA-256 still
matched `843d243792abb05b50e1a7f5e614e1184d8fc7195c119747cbb3038520258a22`.

The exact Windows PowerShell 5.1 Provision invocation ran elevated once and
exited `1` after about 27 seconds. No JIT/runner registration, Group/workflow
change, dispatch, credential/Auth/Snyk action, provider/database access, or
deployment occurred.

### Runtime root cause and containment state

Windows PowerShell Operational event `4100` at
`2026-08-28T14:08:25.1321920Z` records the failure:
`.NET File.Replace` rejected the null backup path in `Write-Ledger` with
`The path is not of a legal form.` The initial `planned` ledger writes via
move; after the marker-only run root was created, the next staged ledger write
uses `File.Replace(..., $null)` and fails under Windows PowerShell 5.1.

The code path had therefore not reached VHD extraction/creation, CIDATA or
evidence disks, switch, gateway, NAT, host probe, VM, VM-NIC ACL, guest boot,
or runner work. Its staged rollback removed the marker-owned run root and ran
the exact inventory assertions, but its final `RolledBack` ledger write hit the
same `File.Replace` defect. The durable ledger consequently remains
`Provisioning` / `IN_PROGRESS` at `planned`; it is **not** a cleanup
attestation.

Post-failure non-elevated evidence shows the per-run root absent, all four
`netsh interface portproxy show` variants exit `0` with no nonblank mapping,
and the cache hash unchanged. Hyper-V inventory remains elevation-protected, so
the missing final elevated rollback ledger means zero residue cannot be treated
as independently durable proof. This failure is fail-closed and blocks all
future Provision/JIT/runner/credential stages pending a reviewed writer repair.

→ **Handoff to Agent 12.** Review the PS5-compatible ledger replacement and
the missing final rollback-attestation behavior before authorizing any further
UAC execution. The isolated runner and release remain **NO-GO**.

## PS5-safe ledger replacement repair — pending Agent 12 review

This static repair addresses only the observed Windows PowerShell 5.1 ledger
writer failure. It does not alter Provision, rollback, network, guest, runner,
or credential behavior, and it does not invoke UAC or retry the failed target.

- An initial ledger still uses an exact same-directory file move when the
  destination is absent.
- A replacement ledger now uses a unique same-directory temporary file and
  unique exact backup path with `File.Replace`; it never passes a null backup
  path to the PS5 runtime.
- The writer removes only its exact temporary/backup artifacts. On a failed
  replacement it preserves the prior destination; if a native replacement ever
  leaves the destination absent but the exact backup exists, it restores that
  backup before propagating the failure.
- A new non-elevated `LedgerReplacementRegression` writes an initial ledger,
  performs multiple atomic replacements ending in `RolledBack`, verifies
  BOM-less valid JSON, injects a replace failure and proves byte-for-byte prior
  ledger preservation, then proves zero writer temp/backup residue.

| Check | Result |
| --- | --- |
| PowerShell parser — Windows PowerShell 5.1 | **PASS** |
| PowerShell parser — pwsh | **PASS** |
| Direct `LedgerReplacementRegression` — Windows PowerShell 5.1 | **PASS** |
| Direct `LedgerReplacementRegression` — pwsh | **PASS** |
| Node 22 `pnpm test:isolated-linux-runner-contract` | **PASS** — 9/9 |
| `pnpm ci:actionlint` | **PASS** — actionlint 1.7.12 checksum verified |
| `pnpm verify:workflow-action-refs` | **PASS** — four existing pinned refs resolve |
| `pnpm ci:gitleaks` | **PASS** — 1,617 commits / 38.75 MB; no leaks |

→ **Handoff to Agent 12.** Review this writer-only repair before authorizing
any third UAC attempt. The runner and release remain **NO-GO**.

## Third guarded elevated Provision attempt — durable rollback, image-conversion blocker

**Reviewed candidate:** `4550d94031194c178da77a3c8f6a6fd34b442526`
**Agent 12 authorization:** `275812c9`
**Run identity:** `third-code-erp-ci-20260828-provision3`
**Result:** **NO-GO — stopped after one attempt; no retry authorized.**

The preflight group readback and post-run readback both show Group `3` is
non-default, selected only for `Third-Code-Solutions/ERP`, has
`restricted_to_workflows=true`, selects only
`Third-Code-Solutions/ERP/.github/workflows/ci-linux-runner-smoke.yml@827719975eb44808da85cbd64cc28074f6ee4ae1`,
and has zero runners. The new run root and ledger were vacant before UAC; the
accepted helper code was unchanged; the exact cache archive SHA-256 remained
`843d243792abb05b50e1a7f5e614e1184d8fc7195c119747cbb3038520258a22`.

The one visible elevated Windows PowerShell 5.1 Provision process ran within
its bound and exited `1`. PowerShell Operational event `4100` records the
first failure as `Convert-VHD` rejecting the extracted official source VHD:

```text
The requested operation could not be completed due to a virtual disk system
limitation. Virtual hard disk files must be uncompressed and unencrypted and
must not be sparse. (0xC03A001A)
```

It failed while converting
`image-staging\livecd.ubuntu-cpc.azure.vhd`, before a converted OS VHDX,
CIDATA/evidence disk, switch, gateway, NAT, host probe, VM, VM-NIC ACL, guest,
or runner stage. No JIT/runner registration, Group/workflow change, dispatch,
credential/Auth/Snyk action, provider/database access, deployment, or
production action occurred.

Unlike the second attempt, the writer repair produced a durable exact-cleanup
record at
`tmp\isolated-linux-runner-third-code-erp-ci-20260828-provision3-runtime-ledger.json`:
`Lifecycle=RolledBack`, `Outcome=PASS`, and `FinalZeroResidue=true`. Its
SHA-256 is `620e6c3634bd63c80eeab7514b68ffee9333d24db0997f44a6b463f62325e585`.
The post-rollback inventory records zero VMs, target switches/NATs, NAT static
mappings, netsh port proxies, target VM-NIC ACLs, and target Docker
containers/networks/volumes; the per-run root is absent. The immutable archive
remains present with its accepted SHA-256.

→ **Handoff to Agent 12.** The image source cannot be passed directly to
`Convert-VHD` on this host because of the sparse/compressed/encrypted source
file limitation. Review a bounded, source-integrity-preserving materialization
repair before any future UAC attempt. The runner and release remain **NO-GO**.

## Dense Azure VHD materialization repair — static implementation, pending Agent 12 review

**Agent 12 contract:** `e9ed8d7a`
**Execution:** static only; no UAC, image download, cache mutation, VM,
switch, NAT, firewall, runner, Group 3/workflow, workflow-dispatch,
credential/Auth/Snyk, database/provider, deployment, or production action.

The approved archive remains the immutable input at
`D:\third-code-erp-isolated-runner-cache\noble-server-cloudimg-amd64-azure.vhd.tar.gz`.
The repaired Provision plan now extracts it only beneath the exact per-run
staging directory, verifies one expected regular Azure VHD there, and
sequentially streams that file into the exact transient destination
`vhd\materialized-source.vhd` before `Convert-VHD` is considered.

- The staging source and dense destination are canonicalized under the exact
  run root, reject path escapes/reparse points, and reject unexpected source
  names, multiple VHDs, non-regular files, or forbidden source attributes.
- Before any destination creation, the plan measures D: free space for the
  source logical length, worst-case converted VHDX size, and a nonzero reserve.
  It refuses insufficient, unmeasurable, or overflowing capacity.
- The dense file uses `FileMode.CreateNew` sequential reads/writes only; it
  cannot overwrite or reuse an existing file. Short read/write or interrupted copy,
  length/content mismatch, and sparse/compressed/encrypted/reparse/offline
  destination attributes all fail closed before conversion.
- Ownership of `transient-dense-source-vhd` is staged durably before output
  creation. Its cleanup authority is the exact marker-owned run-root path, not
  a content hash or VM attachment. Source/destination SHA-256 values are
  provenance only; exact rollback removes only the marker-owned run root and
  does not grant deletion authority over the immutable cache archive.
- `Get-Sha256Hex` now uses .NET SHA-256 streams instead of the optional
  PowerShell `Get-FileHash` module, preserving deterministic PS5/pwsh behavior
  when the host process supplies a restrictive `PSModulePath`.

The non-elevated materialization regression creates a synthetic sparse source
and proves a dense success under Windows PowerShell 5.1 and pwsh. It also
proves fail-closed rejection and exact cleanup for source-name mismatch, path
escape, existing output, insufficient capacity, interrupted and short read/write copies,
output-length/content mismatch, and a forbidden destination attribute. Both
engines reported `TemporaryRootRemoved=true` and `LedgerResidueCount=0`; the
regression does not write to the cache or an external output path.

| Check | Result |
| --- | --- |
| PowerShell parser — Windows PowerShell 5.1 | **PASS** |
| PowerShell parser — pwsh | **PASS** |
| Direct `MaterializationRegression` — Windows PowerShell 5.1 | **PASS** |
| Direct `MaterializationRegression` — pwsh | **PASS** |
| Node 22 isolated-runner contract — workflow/ledger/materialization/portproxy subtests | **PASS** — 8/8 in one bounded invocation |
| Node 22 isolated-runner contract — rollback-plan subtest | **PASS** |
| Node 22 isolated-runner contract — Provision-plan subtest | **PASS** |
| `pnpm ci:actionlint` | **PASS** — actionlint 1.7.12 checksum verified |
| `pnpm verify:workflow-action-refs` | **PASS** — four existing pinned refs resolve |
| `pnpm ci:gitleaks` | **PASS** — 1,621 commits / 38.77 MB; no leaks |
| `git diff --check` | **PASS** |

→ **Handoff to Agent 12.** Static review is required before any fourth
elevated Provision attempt. This repair is not runtime containment proof; the
runner and release remain **NO-GO**.

## Fourth guarded elevated Provision attempt — failed closed with durable rollback

**Reviewed candidate:** `307d184c165772546df793b72f6a9b2e40a62333`
**Agent 12 authorization:** `96463fd6`
**Run identity:** `third-code-erp-ci-20260828-provision4`
**Result:** **NO-GO — stopped after the one authorized attempt; no retry is authorized.**

Before UAC, the accepted helper files were byte-identical to `307d184c`; the
new run root and ledger were vacant; and the immutable archive at its approved
cache path still had SHA-256
`843d243792abb05b50e1a7f5e614e1184d8fc7195c119747cbb3038520258a22`
(603,960,567 bytes). Group `3` was and remains non-default, ERP-only,
`restricted_to_workflows=true`, selected only for
`Third-Code-Solutions/ERP/.github/workflows/ci-linux-runner-smoke.yml@827719975eb44808da85cbd64cc28074f6ee4ae1`,
and has zero runners.

One visible elevated Windows PowerShell 5.1 Provision process ran the exact
accepted helper with the exact non-secret acknowledgement. It completed the
approved dense materialization: the archive yielded the expected
32,213,303,808-byte sparse source; the marker-owned
`vhd\materialized-source.vhd` reached the same logical length with only the
normal `Archive` attribute; and the ledger advanced to
`dense-source-materialized`. `Convert-VHD` then produced the mutable OS VHDX,
and CIDATA/evidence-disk ownership stages completed. No credential, Auth,
JIT, runner registration, Group/workflow mutation, Actions dispatch, provider,
database, deployment, or production action occurred.

PowerShell Operational event `4100` at `2026-08-28T23:06:56.4903657+08:00`
records the first runtime error as:

```text
Failed while adding virtual Ethernet switch connections.
```

The error occurred while creating the run-owned internal virtual switch, before
NAT, VM, VM-NIC ACL, guest boot, guest evidence, host/guest listener probes, or
runner work. The helper's reviewed exact staged rollback completed and the
durable ledger at
`tmp\isolated-linux-runner-third-code-erp-ci-20260828-provision4-runtime-ledger.json`
records `Lifecycle=RolledBack`, `Outcome=PASS`, and
`FinalZeroResidue=true`; its SHA-256 is
`81fc80169fd75709679cbca5478e9e70a8fe7c831e19bfc9526b4f4a0d0c5a25`
(36,884 bytes).

Post-run target inventory is zero VMs, target NATs, NAT static mappings, netsh
port proxies, and target VM-NIC ACLs; the exact run root is absent. The only
remaining host switches are the pre-existing `Default Switch` and
`WSL (Hyper-V firewall)`, which were preserved. The immutable archive hash and
the Group 3 ERP-only, restricted-workflow, zero-runner boundary were re-read
unchanged after rollback.

→ **Handoff to Agent 12.** The fourth attempt is a host virtual-switch
capability/configuration blocker, not a containment pass. Review the durable
rollback evidence and determine any next static remediation; do not authorize a
retry, runner/JIT, Auth/Snyk, provider/database, deployment, or production
work from this result. The runner and release remain **NO-GO**.
