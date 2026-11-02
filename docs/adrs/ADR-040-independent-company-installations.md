# ADR-040 — Independent company installations

Status: accepted for local implementation, 2026-10-11, under the project owner's request to repair the audit and prepare ABI OPS before five independent turnovers.

## Decision

The deliverable is one independently operated ABI OPS installation per company, beginning with a verified independent demonstration. Each installation owns its repository copy, database/auth/storage, runtime, jobs, secrets, domains and backups. No shared SaaS control plane, cross-company tenant switching, billing tiers or white-label customization is required. Existing tenant isolation remains defense in depth.

ADR-027's single active platform owner, verified authentication, recent-authentication checks, immutable user-ID binding and append-only administrative audit remain mandatory. The seller's email is not an authorization constant. A privileged offline bootstrap binds the explicitly selected, verified database/auth user ID and normalized verified email once; public registration, environment email values and client metadata cannot grant ownership. Existing bindings remain valid. A fresh installation cannot silently inherit the seller's ownership. Transfer of an existing binding requires a separate explicit operator procedure and audit; no automatic reassignment.

Release configuration must name and verify the installation's actual provider/account/project/environment/branch. Missing or mismatched identity fails closed. Runtime writer, read-only verification and migration credentials have distinct purposes. A placeholder manifest does not authorize deployment.

Company legal identity belongs to the operating company's document profile. Product branding may remain; communications and transactional documents must use the configured legal company identity. Missing required statutory fields produce a clearly incomplete draft, never fabricated identifiers or an issuable-form claim. The first installation uses an operator-led readiness checklist and verified first administrator, rather than SaaS self-service onboarding.

Existing preview-only approval policy and unconfigured external adapters remain explicitly unavailable until actual policy and provider acceptance exist. The demonstration must distinguish implemented operating workflows from these gated extensions.

Purchase-order approvals and line-price mutations use existing audited server commands. Authenticated Data API clients retain only tenant-isolated reads for the same roles permitted by the purchase-order route; direct writes are denied by grants and restrictive RLS. This closes the Viewer approval bypass without changing the server workflow contract. Issued company identity is database-controlled and cannot be supplied or replaced by callers.

App Router recovery uses inherited boundaries plus explicit critical workflow boundaries, as enforced by `verify:app-router-boundaries`. It does not duplicate identical loading/error files for every page. The generic workspace loader must not imply dashboard KPIs; dashboard-specific loading remains on `/dashboard`. A rendering failure cannot establish whether a preceding mutation committed, so recovery copy directs users to verify the record before submitting again.

Dependency remediation may update already installed packages and use a narrowly reviewed local patch where an advisory has no upstream fix. Mammoth 1.12.0 is used only through its document-extraction library; its unused CLI-only `argparse` dependency is removed by an exact-version pnpm override to eliminate the unpatched `sprintf-js` chain. Mammoth's standalone CLI is not an ABI OPS command. DOCX extraction must continue to pass real document tests. Worker lockfiles and CI security tooling are permitted without adding new application runtime functionality. No advisory is silently suppressed to obtain a passing gate.

## Verification and recovery

Worker images pin Python 3.12 on Debian 13 (Trixie), replacing the older Debian 12 runtime after the container scan identified a SQLite advisory fixed in Trixie. Native CAD compilation is limited to two parallel jobs so a many-core builder does not exhaust memory. Remaining upstream OS advisories stay visible and keep the image security gate closed; changing the base does not waive them.

Test verified-owner ID/email mismatch, unverified email, absent or multiple bindings, inactive account and public bootstrap denial. Test fresh setup and release configuration without production credentials. Restore synthetic database and stored-object evidence into an isolated environment; actual buyer backup ownership and recovery objectives remain release acceptance inputs.

Migrations are additive and preserve existing active owner rows. No production identity transfer, schema mutation or financial rewrite is authorized by this ADR. Deployment and commercial/legal acceptance remain separate from local implementation proof.
