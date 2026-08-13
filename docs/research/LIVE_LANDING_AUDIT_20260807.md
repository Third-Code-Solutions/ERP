# Third Code ERP live surface audit - 2026-08-07

Read-only target: `https://thirdcode-erp.vercel.app`.

## Public landing

- Desktop: 1440x1000; document client/scroll width 1425/1425.
- Tablet: 768x1024; document client/scroll width 753/753.
- Mobile: 390x844; document client/scroll width 375/375.
- One `main`, one primary `nav`, one `h1`; H1 width stays 560, 674, and 327
  pixels at the observed viewports.
- Responsive hero source loaded at 768x512 on tablet and 390x260 on mobile.
- Primary mobile CTAs are 327x54 pixels; header setup CTA remains visible.
- Cortex accordion selection and the first FAQ disclosure both changed state.
- Organization, SoftwareApplication, and five-question FAQ JSON-LD parsed.
- Console warnings/errors: 0. Horizontal overflow: 0.

## Authenticated dashboard

The historical production Server Component error was not reproduced. The
existing signed-in session rendered `/dashboard`, its navigation, current demo
KPIs, pipeline, risk signals, scorecard, and analytics. Console warnings/errors:
0. No write control was used.

## Boundary

This is browser evidence for current deployed behavior, not a deployment or
release certification. No page source was copied, no external product code or
branding was used, and no provider, database, auth, Storage, or tenant state was
changed. Current source changes remain local/non-production until all release
gates and explicit cost approval pass.
