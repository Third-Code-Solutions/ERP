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
