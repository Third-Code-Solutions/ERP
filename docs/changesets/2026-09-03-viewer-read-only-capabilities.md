# Viewer read-only capability contract

## Outcome

- Central authorization now classifies every business capability as tenant-safe
  read/export, mutation, or the internal provider-quota operation.
- Viewer is granted every classified read/export capability and is denied every
  mutation capability. Existing grants for the other twelve roles are retained.
- KYC queue, inventory closeout, and semantic-index status use distinct read
  capabilities instead of their review/manage capabilities.
- Notification state changes and Cortex conversation/generation writes now use
  mutation-only capabilities. Viewer can still list/read their tenant-bound data.
- Universal search and Cortex search explicitly include all current tenant-safe
  business record types for Viewer. The Cortex list remains explicit and bounded,
  so future auth/secret node kinds are not inherited automatically.

## Security boundary

No capability exposes credentials, authentication artifacts, provider secrets,
or cross-tenant data. `provider.quota.consume` remains a separate internal
operation used to meter otherwise read-only provider requests; it is not a
business-record mutation. Every API/service query remains responsible for its
existing tenant and membership predicates.

## Verification

- Shared authorization tests exhaustively assert all 92 capabilities: every
  read/export grant includes Viewer, every mutation grant excludes Viewer, and
  the three capability classes cover the full vocabulary without overlap.
- Universal-search tests cover Viewer across all 18 returned entity kinds.
- Core controller metadata tests lock the read/write seams for KYC, closeout,
  semantic indexing, notifications, conversations, and assistant generation.
- Core search-scope tests lock the explicit 48-node Viewer allowlist.

## Sequential handoff to Agent 03

Replace page/navigation read gates without changing mutation controls:

- KYC queue: `account.kyc_review` -> `account.kyc.read` for page visibility;
  review buttons/actions remain `account.kyc_review`.
- Admin users/project access: page/list/read gates -> `admin.users.read` and
  `project.access.read`; role/access mutations remain `admin.users`.
- Rate cards: read/page gates -> `admin.rate_card.read`; edits remain
  `admin.rate_card`.
- Mapping/data-quality metadata: read/page gates ->
  `admin.system_config.read`; changes remain `admin.system_config`.
- Procurement page/read navigation -> `procurement.read`; PO/RFQ/delivery
  controls retain their existing mutation capabilities.
- Documents page/read navigation -> `document.read`; upload/process/delete
  controls retain their existing mutation capabilities.
- Inventory closeout and Cortex job status read controls may use
  `inventory.closeout.read` and `cortex.index.read`; create/deactivate/index
  controls remain their manage capabilities.
- Hide/disable all notification state and Cortex assistant write controls for
  Viewer via `notification.manage` and `cortex.assistant.use`.

Agent 03 must add route-level and rendered-control tests for all thirteen roles,
then browser-check Viewer navigation and read-only behavior. This changeset does
not claim route/UI or live production verification.
