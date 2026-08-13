# Third Code ERP live landing audit - 2026-08-12

Status: OBSERVED, read-only browser evidence. No deployment, provider setting,
database write, credential change, or paid action was performed.

Target: `https://thirdcode-erp.vercel.app/`

## Route and identity

- HTTP/browser navigation reached the public landing route.
- Title: `Construction ERP with a permission-aware AI brain`.
- Rendered brand: `Third Code ERP` and `Third Code Solutions Inc.`.
- No ERPNext/Frappe/vendor branding appeared in the rendered page.
- Unauthenticated `/dashboard` redirected to `/auth/login`.

## Responsive measurements

| Viewport | Document height | Scroll width / client width | H1 | Navigation |
| --- | ---: | ---: | --- | --- |
| 1440 x 900 | 8,720px | 1,425 / 1,425px | Satoshi 72px / 65.52px, 3 lines | 1,380 x 68px, top 18px |
| 768 x 900 | 8,474px | 753 / 753px | Satoshi 48px / 43.68px, 3 lines | 713 x 68px, top 18px |
| 390 x 844 | 9,948px | 375 / 375px | about 41.73px / 40.06px, 3 lines | 355 x 62px, top 10px |

No horizontal overflow was observed at any tested viewport. Navigation stayed
fixed with `rgba(7, 19, 31, 0.78)` and the existing deep shadow.

## Page topology observed at 1440px

| Surface | Top | Height |
| --- | ---: | ---: |
| Hero | 0 | 900px viewport section |
| Platform | 964 | 1,448px |
| Cortex capability | 2,412 | 1,197px |
| Workflows | 3,609 | 2,237px |
| Team priority | 5,846 | 712px |
| FAQ | 6,558 | 969px |
| Closing CTA | 7,758 | 584px |

Landing contains three images, no video elements, and a JSON-LD graph with
`Organization`, `SoftwareApplication`, and `FAQPage` nodes.

## Interaction and runtime sweep

- Capability controls switch one `aria-expanded="true"` panel at a time.
- FAQ uses native `details` disclosure; opening the first question revealed its
  answer in place.
- Team-priority controls expose four bounded states with accessible labels.
- Desktop hero media is scroll-linked: at `scrollY=700`, opacity measured
  `0.4188` and transform was approximately `scale(1.0005)`; navigation did not
  change appearance.
- At 390px the hero media remains in normal flow and the desktop scroll tween
  is not applied.
- Browser console: 0 errors, 0 warnings.
- Network sweep showed only expected same-origin auth-link prefetches and the
  Vercel analytics event endpoint; no AI, email, Storage, or ERP transaction
  request was triggered by the public page.

## Release interpretation

Public landing behavior is verified for this observation window. This does not
prove authenticated dashboard health, Supabase migration parity, Core selector
readiness, or production deployment completeness. Keep all migration selectors
closed and do not trigger Vercel/Railway builds while the hosted Purchase Order
duplicate gate and spend controls remain unresolved.
