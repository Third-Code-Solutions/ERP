# Company legal identity and installation readiness

## Outcome

- Added nullable tenant legal identity fields: registered legal name, registered address, document contact email, and document contact phone.
- Added immutable issuer legal-profile snapshots to invoices and purchase orders. Database triggers capture the profile on first transition to `issued`, reject issuance when legal name, registered address, or BIR TIN is missing, and leave legacy issued rows unsnapshotted rather than rewriting history.
- Updated invoice and purchase-order print views to use current identity for drafts and captured identity for issued records. Missing or legacy identity is visibly marked incomplete.
- Converted the BIR 2307 output to an explicitly incomplete worksheet, corrected customer/payor and contractor/payee placement, left unknown TIN data blank, and removed certification language.
- Updated Web and Core transactional email wrappers to use the tenant legal name. Missing identity is stated instead of substituting Actuate Builders Inc.
- Replaced fixed `A` marks in weekly and inspection reports with initials derived from configured legal identity. Missing legal identity is explicit.
- Added editable company identity fields and an operator-led installation-readiness checklist in Settings. Signup copy now describes operator verification instead of a nonexistent guided setup.
- Mapped invoice pricing and company-identity database guards, plus the purchase-order company-identity guard, to HTTP conflict responses.

## Verification

- PASSED: clean replay and seed of all 183 migrations, including `20261011160000_tenant_legal_document_identity.sql` (run by main agent against owned synthetic database).
- PASSED: tenant document identity database contract, 1 test. Proves incomplete issuance rejection and immutable captured identity.
- PASSED: customer receivables, cash allocation, and inventory stock-ledger database suites, 70 tests.
- PASSED: customer invoice issue/reverse, finance receivables, and purchase-order workflow integration group after synthetic fixture updates, 4 tests total; reverse rerun passed after adding explicit reconciled pricing basis.
- PASSED: Web legal identity, Resend template, weekly report, Settings, and auth-layout unit suites, 27 tests.
- PASSED: Core invoice/PO error mapping and procurement email unit suites, 14 tests.
- PASSED: targeted `git diff --check`.

All final focused commands used repository Node 22.23.2. No provider call, browser run, deployment, commit, or production data mutation was performed.

## Remaining limits

- Customer accounts do not yet store a registered TIN. BIR 2307 therefore remains an incomplete worksheet and must not be represented as an official certificate.
- Historical issued invoices and purchase orders created before this migration have no issuer snapshot. Print views label them as legacy and do not substitute current tenant settings.
- Target-installation administrator recovery, integrations, backups, opening balances, master data, and buyer acceptance remain operator verification steps.
