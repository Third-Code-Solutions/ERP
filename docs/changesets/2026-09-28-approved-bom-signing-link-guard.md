# Approved BOM signing link guard

- BOM portal link creation now requires an approved BOM before creating a signing session, legacy token, external notification, or semantic audit entry.
- Its project and account joins are tenant-scoped, and a missing tenant project stops link creation.
- This prevents a client from receiving a draft or already-locked BOM signing link that the signer later rejects.
- Focused regression tests passed for draft, locked, archived, approved, and missing tenant project states (5/5); Web TypeScript passed. No hosted records or signing sessions were changed.
