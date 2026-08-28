# Agent 12 — fourth isolated-runner Provision failure review

**Date:** 2026-08-28
**Scope:** Post-runtime security review of Agent 13 evidence commit
`3494822a33511cf308611b14e6c15195cc72a573`. This review makes no host,
runner, GitHub group, workflow, credential, provider, database, or production
change.

## Decision

- **Failure attestation: ACCEPT.** The reviewed attempt failed closed and the
  durable rollback attestation is internally consistent with independently
  re-read cache, GitHub group, event-log, and local residue evidence.
- **Dense-image materialization contract: PASS, narrowly.** The attempt
  reached `dense-source-materialized`, `Convert-VHD`, CIDATA, and
  evidence-disk stages. It therefore demonstrates that the accepted
  materialization repair overcame the sparse-source `Convert-VHD` failure.
- **Isolated runner readiness / further Provision: REJECT (NO-GO).** The
  required internal virtual-switch boundary was not created. No retry,
  fallback network, JIT registration, runner registration, credential/Auth,
  Snyk, provider, database, deployment, or production action is authorized.

## Independent evidence review

| Control | Evidence read 2026-08-28 | Result |
| --- | --- | --- |
| Immutable cache | `D:\third-code-erp-isolated-runner-cache\noble-server-cloudimg-amd64-azure.vhd.tar.gz` exists with length `603,960,567` and SHA-256 `843d243792abb05b50e1a7f5e614e1184d8fc7195c119747cbb3038520258a22`. | **PASS.** The archive was not changed by the attempt. |
| Durable rollback | `tmp/isolated-linux-runner-third-code-erp-ci-20260828-provision4-runtime-ledger.json` parses as JSON and hashes to `81fc80169fd75709679cbca5478e9e70a8fe7c831e19bfc9526b4f4a0d0c5a25`. It records schema `2`, `Lifecycle=RolledBack`, `Mode=Provision`, `Outcome=PASS`, the reviewed run identity, and `FinalZeroResidue=true`. Its post inventory lists zero VMs, NATs, NAT mappings, and VM-NIC ACLs; the exact run root is absent. | **PASS.** The JSON `PortProxies` property is `null`, which is an empty collection in this serializer—not a proxy. Independently, `netsh interface portproxy show all` returned exit `0` with blank output and `Get-NetNatStaticMapping` returned zero entries. |
| Switch rollback | `Microsoft-Windows-Hyper-V-VmSwitch-Operational` records creation activity for `third-code-erp-ci-20260828-provision4-switch`, followed by `NetEventBindFailed` and `Delete complete` at `2026-08-28 23:06:56`. Only the pre-existing `Default Switch` and `WSL (Hyper-V firewall)` remain in the ledger. | **PASS for removal; not a guest-boundary pass.** The target switch was removed before a VM/NAT/guest existed. |
| GitHub runner boundary | Direct GitHub API readback: group `3` is non-default `erp-ci-isolated`, `visibility=selected`, `restricted_to_workflows=true`, has only `Third-Code-Solutions/ERP`, and has only `Third-Code-Solutions/ERP/.github/workflows/ci-linux-runner-smoke.yml@827719975eb44808da85cbd64cc28074f6ee4ae1`. The repository runner count is `0`. | **PASS.** This is a restriction control, not execution proof. |
| Credentials and release targets | The staged record and execution boundary stop before NAT, VM, ACL, guest boot, listener checks, JIT, runner, secrets, Auth, provider, database, deployment, or production. No contrary runner or workflow mutation is observable in the direct GitHub readback. | **PASS for non-entry to those stages.** It does not satisfy the still-missing release gates. |

The non-elevated review identity was correctly denied direct `Get-VM` and
`Get-VMSwitch` enumeration by the host authorization policy. That is not
treated as proof of either success or failure; the durable elevated ledger and
the independent virtual-switch event log are the evidence used above.

## Failure diagnosis and security implication

The first PowerShell Operational event `4100` at `2026-08-28T23:06:56`
identifies `New-VMSwitch` as the failing command and includes the underlying
error:

```text
Internal miniport create failed, name = '24DEA9FE-354E-4CB1-BBC2-153E57C33AB1',
friendly name = 'third-code-erp-ci-20260828-provision4-switch', MAC = 'DYNAMIC':
Cannot create a file when that file already exists. (0x800700B7).
```

The adjacent vSwitch log records a `NetEventBindFailed`; it then records the
target switch deletion. This is a host Hyper-V virtual-switch/miniport binding
collision, not an image, guest, Docker, or GitHub runner failure. The exact
colliding host object is not identified by the current evidence because the
ephemeral miniport and switch were removed during rollback.

The security consequence is strict: the isolation boundary did not exist, so
the controls that depend on it (VM NIC ACLs, private egress restriction,
guest-local Docker listeners, host-to-guest denial, and cleanup after guest
execution) remain unproved. Reusing `Default Switch`, `WSL (Hyper-V firewall)`,
an external/bridged adapter, Docker Desktop, or a Windows desktop runner would
change the reviewed trust boundary and is prohibited.

## Only authorized next step: bounded read-only diagnostics

Agent 13 may run one recorded, **read-only** diagnostic collection—elevated
only if Windows requires it to read protected state. It must not invoke the
Provision helper and must preserve the current zero-runner/zero-target state.
The collection may contain only:

1. Exact event records in the `23:05`–`23:08:30` interval from
   `Microsoft-Windows-PowerShell/Operational`,
   `Microsoft-Windows-Hyper-V-VmSwitch-Operational`, Hyper-V VMMS Admin and
   Operational logs, and any available Hyper-V Compute/Networking logs;
   preserve IDs, timestamps, provider, message, and errors without copying
   credentials.
2. Read-only inventory of `vmms`, `vmcompute`, and `hns`; installed Hyper-V
   feature state; existing VMs/switches/NATs/static mappings; all `netsh
   interface portproxy show` variants; Hyper-V switch extensions/features;
   and existing target-labeled resources. The output must explicitly distinguish
   the pre-existing Default Switch and WSL resources from any target.
3. Read-only network-stack evidence sufficient to identify the collision:
   hidden and present Net adapters, the `vms_pp` binding state, relevant PnP
   devices and network-class registry identities, plus matching NIC/switch
   GUIDs. The report must query the failed miniport GUID above and record
   whether a matching live or ghost device exists.
4. Fresh target-residue assertions after collection: no target VM/switch/NAT/
   mapping/proxy/ACL/run root, unchanged immutable cache SHA, and unchanged
   Group 3 repository/workflow/zero-runner readback.

The collection must not run `New-*`, `Remove-*`, `Enable-*`, `Disable-*`,
`Restart-Service`, `netcfg`, `netsh set`, `wsl --shutdown`, Docker commands,
adapter/driver repair, firewall/ACL changes, Internet Connection Sharing or
WinNAT changes, or any cleanup beyond read-only verification. It must not
delete/recreate Default Switch or WSL resources.

## Remediation boundary

**No static or runtime remediation is accepted yet.** A generic retry cannot
make an `0x800700B7` miniport collision safe. After the diagnostic record,
Agent 13 may propose a *static-only* remediation contract only if it names the
specific colliding component, uses a vendor-supported narrow repair, preserves
all pre-existing switches/adapters, and includes exact pre/post inventories,
an approved restore plan, and a zero-residue assertion. Any repair that changes
shared Hyper-V, Default Switch, WSL, physical adapter, driver, service,
firewall, NAT, or Docker state requires a separate explicit human authorization
after Agent 12 accepts that exact contract. It must never be automated as part
of runner Provision.

Independent release blockers remain **NO-GO**: successful fail-closed hosted
Gitleaks, Snyk, Semgrep, and Trivy gates; protected immutable release identity;
production environment protection; read-only production migration/schema parity;
the disposable Auth/RLS 13-role matrix; and the ABI/fractional-quantity/DUPA
business decision.

→ **Handoff to Agent 13.** Collect only the bounded read-only diagnostic
evidence above. Do not remediate, retry Provision, or register a runner. Return
the raw evidence and a static-only proposal, if a specific cause is found, to
Agent 12 for review.
