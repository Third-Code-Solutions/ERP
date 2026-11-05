# OCE observations: tenancy (tenant tax settings)

`oce-recon` module mode, 2026-11-04. Worktree `D:\thirdcode\ERP-docs2`.

**Clean room.** I read only OpenConstructionERP's (OCE) public descriptive
material: the website docs page, the playbook index, two playbooks, the repo
README, and the first ~100k characters of the CHANGELOG (v19.0.0 back to the
start of v18.2.0). I opened no source, schema, migration or i18n file. All
wording below is mine. No OCE names, strings or data are copied.

**Bottom line.** OCE's public material says almost nothing about a
tenant-level tax profile. Tax rules in OCE come from country add-ons and
project or contract settings, not from one company record. **There is no
Philippine add-on.** Our spec therefore rests on PH practice and on our own
existing `tax_profiles` table. OCE only contributes a few general behaviours,
marked "useful" below.

## Purpose and primary users
- Tax rates feed estimate markups, purchase orders, payment certificates and
  invoices.
- The people who set them are administrators (configuration) and accountants
  (tax standing of counterparties). Estimators and commercial managers consume
  the rates.

## Screens and views (concept level)
- A general settings area covering profile, interface and module
  configuration. No public page describes a tenant tax-settings screen.
- An administrator screen to install or remove country add-ons and to preview
  updates to shipped tax reference data.
- Counterparty records that hold tax standing and certificate expiry, plus a
  list of upcoming expiries.

## Entities and attributes (our names)
- **Country tax reference data**: dated statutory rates per country (VAT,
  withholding, stamp duty where relevant), each with an effective period and
  a statute citation in some countries.
- **Company within a group**: can carry its own tax ID. A project can name its
  owning company, and that choice decides which country's VAT applies and how
  invoices are numbered.
- **Project default VAT rate**: purchase orders take their VAT rate from the
  project's setting.
- **Contract retention terms**: percentage, cap and release split, preset from
  a country's usual values and then edited per contract.
- **Counterparty tax standing**: withholding scheme band, the evidence for it,
  and certificate expiry dates.

## Lifecycle and who triggers it
- Only an administrator may add or remove country add-ons or change
  workspace-wide defaults.
- Updates to shipped tax reference data are previewed first. Local edits
  survive the update, and rates that conflict are held for review rather than
  overwritten. **Useful:** never overwrite a tenant's tax data silently.
- Some country add-ons ship *without* rates and state that a local specialist
  must review every figure before use. **Useful:** this matches our owner
  decision to keep rates read-only until Q3 and Q7 are answered.
- No public page describes a draft/approve step or maker-checker for tax
  settings.

## Calculations observed (in words)
- VAT as a markup on an estimate is applied after overhead and profit:
  VAT = rate × (net + overhead + profit). (Estimate pricing only. Our DUPA
  already models this; it is out of scope here.)
- On a payment certificate, retention, VAT and withholding are each a rate
  × a base, with the rates taken from dated statutory tables.
- Counterparty withholding: rate × (gross − excluded amounts); gross,
  deduction and net are shown separately.
- Rounding rules are not stated publicly.

## Validations, warnings and edge cases
- **Useful:** a bill whose VAT rate is not in force on its date is flagged.
- **Useful:** a bill can carry a tax date separate from its price date, and
  VAT is resolved on the tax date. This supports our rule of resolving rates
  on a document's business date.
- **Useful:** existing orders keep the figures they were created with when a
  default rate changes. This supports snapshotting the rates used on each
  document.
- A rate typed on an order overrides the project default. (Overrides are out
  of scope for us this release.)
- **Useful:** if a counterparty's tax standing was never recorded, the
  scheme's highest-deduction band applies, so the default fails safe.
- Duplicate shipped rates were once a bug and were de-duplicated, so overlap
  in dated rates is a real risk. **Useful:** our spec makes overlap a hard
  error.

## Links to other modules
- Rates flow into estimates (markup), purchase orders, payment certificates,
  invoices and subcontractor payments.
- Contract retention terms flow into payment certificates and retention
  release.

## Import and export
Nothing public on importing or exporting tax settings, apart from the
administrator preview and apply of shipped reference data.

## What this means for our spec
1. Effective-dated, immutable profiles with a fallback default (our table
   already has `valid_from` / `valid_to` and draft / active / retired).
2. Resolve rates on the document's business date, and store the rates used on
   the document.
3. Overlapping in-force profiles block money writes.
4. Only privileged roles may change tax settings; this release nobody can.
5. Per-counterparty bands (D-9) and contract retention (D-13) are real needs
   but stay out of scope, as the owner decided.

## Sources

**OCE public descriptive material (no source files opened)**
- https://openconstructionerp.com/docs (markups, country add-ons, roles)
- https://github.com/datadrivenconstruction/openconstructionerp (README:
  onboarding, markups, roles)
- https://raw.githubusercontent.com/datadrivenconstruction/OpenConstructionERP/main/CHANGELOG.md
  (read v19.0.0 2026-11-02 back to the start of v18.2.0; entries in v18.3.0,
  v18.4.0, v18.5.0, v18.6.0, v18.6.1, v18.6.4, v18.7.0, v18.8.0, v18.9.0 and
  v19.0.0. The remaining ~1.28M characters were not read.)
- https://openconstructionerp.com/cases (playbook index)
- https://openconstructionerp.com/cases/pay-a-sub-without-inheriting-their-tax-bill
- https://openconstructionerp.com/cases/manage-retention-across-the-supply-chain

**Philippine practice (non-OCE; from `survey.md`, secondary sources, verify before encoding)**
- S-ph1 VAT 12% on services (NIRC Sec. 108)
- S-ph3 EWT under RR 2-98, contractors 2%
- S-ph4 RA 9184 IRR: 10% retention on progress payments
- S-ph10 RR 7-2024 / EOPT: the invoice is the primary sales document

**Could not find**
- Any public OCE description of a tenant-level tax profile, its approval, or
  who may edit it.
- The OCE retention base or rounding, and whether tax applies to retained
  amounts (our Q3).
