# BuildOps Live Demo — Runbook (2026-05-10)

## Demo credentials

```
URL:      http://localhost:3000  (or your deployed URL)
Email:    test@buildops.local
Password: testpassword123
Tenant:   BuildOps E2E Tenant
```

## Pre-meeting checklist (5 min)

- [ ] Dev server running:
  ```
  cd apps/web && pnpm dev
  ```
  Wait for `✓ Ready in N ms` then open http://localhost:3000
- [ ] DXF parser worker running (only if you'll demo a binary `.dwg`):
  ```
  cd apps/workers/dxf-parser && ./run-local.sh
  ```
  Or skip and demo with the bundled `.dxf` sample.
- [ ] Browser zoom at 100% in fullscreen (F11). Hide bookmarks bar.
- [ ] Close other tabs. The audience watches what's on screen.
- [ ] Have the sample CAD file ready for upload:
  ```
  apps/web/public/samples/mep-sample.dxf
  ```
  (Drag-drop from this path into the upload zone during demo.)

## Demo data already in place

After running `apps/web/scripts/seed-demo.sql` once, the tenant has:

- **4 projects** including 1 active fit-out (Somnus Studios — Phase 2), 1 active MEP (Ayala Premier Tower), 1 closed-won (BGC Lobby)
- **5 opportunities** spread across Coverage (1) and Conversion (4) — all 7 stages represented somewhere
- **6 BOMs** including a fully-priced approved one on Somnus
- **2 invoices** showing PH tax math (one paid, one issued and current)
- **1 PO** in partial-delivery status (18 of 24 FCUs received)
- **3 project comments** on Somnus showing recent activity

Re-seed (idempotent) any time:
```
/Applications/Postgres.app/Contents/Versions/latest/bin/psql \
  "$(grep DATABASE_URL apps/web/.env.local | cut -d= -f2- | sed 's/?pgbouncer=true//')" \
  -f apps/web/scripts/seed-demo.sql
```

## Run-of-show — 25 minutes

### 1. Open: Dashboard (3 min)
- "Single screen, every project, real time"
- Point at Active Pipeline TCV ≈ ₱14.9M, Active GP ≈ ₱3.5M, Weighted Pipeline, Closed Won (YTD), Coverage Leads
- Per-rep scorecard table — "Your reps' performance vs. targets, live"
- Stage distribution — "Where every deal is right now"
- Right rail alerts — "GP erosion, stalled deals, overdue invoices — stuff that loses you money silently"

### 2. Pipeline → Conversion (3 min)
- Show the 4 conversion deals
- Click one — show the project record, advance stage dropdown ("Move to BOM Submission" or "Move to Negotiation")
- DON'T click Lost during demo unless asked — it opens a dialog and you'll lose flow

### 3. The wow: Project → Scope → BOM (8 min)

This is THE pitch. Build slowly.

- Open Somnus Studios → Documents tab
- "Watch what happens when an estimator drops a CAD drawing"
- Drag `apps/web/public/samples/mep-sample.dxf` onto the upload zone
- Wait ~3 seconds — the success line shows "X scope items extracted" + "draft BOM ₱X.XM TCV (Y% GP) — Z RAG matches"
- Click Scope tab — show extracted items grouped by source document
- Click BOM tab — show:
  - The pricing source breakdown chips at top (RAG / Catalog / Manual / Unpriced)
  - Each line has a tiny `RAG` / `CAT` / `M` pill — "every peso traceable to a source"
  - Total Cost, TCV, GP, Margin% computed from PH industry catalog + similar past projects

Talking points:
- "6–8 hours of estimator time → 90 seconds"
- "Every line cited — no black-box AI"
- "Markup, retention, VAT, withholding tax all PH-default"

### 4. Billing tab (4 min)
- Open Somnus → Billing
- Show the two existing invoices
- Click INV-202605-001 → invoice detail
- Walk through: Billing % → Subtotal → Retention 10% → VAT 12% → Withholding 2% → Net Amount Due
- Click **BIR 2307** button — opens a printable Form 2307 with payor / payee / tax base
- "BIR-compliant invoice numbering, no gaps, no manual computation, audit-ready"

### 5. Procurement → PO partial delivery (3 min)
- Open `/purchase-orders` → click PO-2026-0001
- Show the 2 lines, "Received" column showing 18/24 and 4/4
- Edit the receive number on the FCU line, click Save → instant feedback
- "When all lines are fully received, the PO auto-flips to Delivered. Audit log captures every step."

### 6. Comments + audit (2 min)
- Back to Somnus project → Comments tab
- Show the 3 seeded comments + composer
- Type a quick comment to demo real-time save
- Click Audit tab — show the immutable hash-chained log
- "Hash-chained audit log; you can prove what happened, when, and by whom — useful for client disputes and BIR audits"

### 7. Close — 2 min
- "Built specifically for PH MEP/fit-out firms. Phase 1-4 of our roadmap is in your hands today. Phase 5 mobile is on the way."
- Pricing / next-step ask

## What NOT to click during demo

| Avoid | Why | Workaround |
|---|---|---|
| **Sign up flow** | New tenant onboarding flow needs design partner setup; tenant is auto-created via DB trigger which works but isn't polished | Use the seeded login |
| **Settings → tenant edit** | Form works but no validation feedback for some fields | Skip unless asked |
| **Reports tab** | Placeholder | Skip |
| **AI chat with empty project** | Will work but "no data" feel | Use Somnus, which has BOM + invoices |
| **DWG file upload (binary)** | Requires worker running. Will return graceful "queued for parsing" message if worker is offline, but breaks flow | Use the bundled `.dxf` sample instead |

## If something goes wrong

| Symptom | Quick fix |
|---|---|
| Dashboard empty | Re-run `seed-demo.sql` |
| Login fails | Check `.env.local` has `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` |
| Upload hangs | Kill the upload, refresh page; the partial isn't committed |
| Page 500 | Hit refresh; if persistent, restart `pnpm dev` |
| BOM page shows "no BOM" | The demo project has `version=1` approved BOM seeded — if missing, re-run seed |

## After demo: client trial access

If the client wants to try it themselves:

1. Create a new Supabase project (don't share `aqqrtkmtcsfkbyyqxowv` — it's the demo tenant)
2. Apply all 7 migrations
3. Create their tenant + admin user via signup
4. Frame this as a "design partnership pilot" — supported, not unsupervised production access (per the audit gaps still open: no MFA, no role-based route enforcement, no observability stack yet, BIR 2307 marked DRAFT pending CPA review)

## Known caveats (be honest if asked)

- "How do you handle real BIR e-Invoicing?" — On the roadmap. Today we're BIR-format compatible (numbering series, 2307 generation, tax math) but not yet integrated with the BIR e-Invoice gateway.
- "What about MFA?" — Phase 2 hardening. Email/password today.
- "Mobile?" — On the Phase 5 roadmap (Q1 2027 target).
- "Can my estimator use this offline?" — Web-first today. PM mobile companion app is Phase 5.
