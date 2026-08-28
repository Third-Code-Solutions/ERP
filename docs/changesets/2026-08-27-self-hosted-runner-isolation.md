# Self-hosted runner isolation handoff

## Outcome

Created the documentation-only containment handoff at
`docs/handoffs/2026-08-27-self-hosted-runner-isolation.md`.

It records that the earlier ephemeral runner is gone, the organization Default
runner group is too broad, the interactive desktop identity must not become the
runner service identity, and Docker Desktop's observed wildcard listener cannot
be treated as loopback-only.

## Ordered next actions

1. Agent 13 verifies selected ERP-only runner-group capability and writes the
   exact workflow/host-containment implementation plan.
2. Agent 12 independently accepts or rejects that plan, including the real
   privilege of Docker access and effective firewall containment.
3. Only after acceptance may the repository owner explicitly approve one
   limited UAC elevation for the reviewed local account, service, and firewall
   changes.

## Verification and boundaries

- PASSED: documentation was added on distinct Agent 01-owned paths; no
  application, workflow, runner-group, local-account, firewall, billing,
  production, provider, or deployment setting was changed by this changeset.
- NOT RUN: CI, runner registration, UAC elevation, firewall validation, and
  production checks. They are deliberately deferred to the named owners and
  approval boundary.
- Release status remains **NO-GO**. This handoff does not close the required
  self-hosted CI, hosted security/billing, production-parity, or ABI commercial
  gates.
