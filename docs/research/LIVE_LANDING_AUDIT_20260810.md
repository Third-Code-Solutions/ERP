# Third Code ERP live landing audit - 2026-08-10

Read-only target: `https://thirdcode-erp.vercel.app/`.

## Browser evidence

- Desktop viewport: 1440x900; client/scroll width 1425/1425; document height
  approximately 8,720px.
- Tablet viewport: 768x900; client/scroll width 753/753; the full desktop
  link group is hidden and the hero becomes a single column.
- Mobile viewport: 390x844; client/scroll width 375/375; document height
  approximately 9,809px.
- One `main`, one primary `nav`, and one `h1` were observed. H1 widths were
  approximately 560px desktop, 674px tablet, and 327px mobile; each rendered
  as three visual lines.
- Desktop hero visual measured approximately 812x541px; mobile responsive
  source measured 390x260px. No horizontal overflow was observed.
- Page title: `Construction ERP with a permission-aware AI brain`.
- Canonical: `https://thirdcode-erp.vercel.app`; Open Graph title and image
  are present. JSON-LD contains Organization, SoftwareApplication, and a
  five-question FAQPage.

## Interaction and boundary evidence

- All four Cortex capability controls changed exactly one
  `aria-expanded="true"` state at a time.
- Network sweep found successful font, image, stylesheet, chunk, RSC, and
  analytics requests; no failed request was observed in the filtered sweep.
- Console error sweep: 0 errors. No write control was used.
- Unauthenticated `/dashboard` redirected to `/auth/login`; protected
  dashboard behavior remains unverified without an authorized session.
- The live snapshot did not contain the newer source-branch Cortex query
  preview controls. This is recorded as source/live drift; it was not fixed
  by deploying because the Vercel spend lock is active.

## Artifacts

- Desktop capture: `docs/design-references/third-code-erp-live-desktop.png`.
- Mobile capture: `docs/design-references/third-code-erp-live-mobile.png`.

## Boundary

This is read-only browser evidence, not deployment or release certification.
No provider, database, auth, Storage, tenant state, or paid action changed.
The clean-room landing contract remains original Third Code ERP behavior; no
ERPNext/Frappe code, branding, text, or internal structure was copied.
