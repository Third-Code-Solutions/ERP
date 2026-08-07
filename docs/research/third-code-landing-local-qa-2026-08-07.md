# Third Code ERP landing local QA - 2026-08-07

## Boundary

Production build served only on `127.0.0.1:3300`. No Vercel deployment,
Railway deployment, managed Supabase write, or live production request.

## Observations

- Desktop 1440x1000: complete 9,029px page, three-line hero H1, dense bento
  platform grid, loaded hero asset, no body horizontal overflow.
- Mobile 390x844: compact nav, three-line hero H1, no horizontal overflow,
  all visible top-screen click targets at least 44px.
- Cortex preview: all three questions update `aria-pressed`, answer, and
  evidence items.
- Capability accordion: active panel changes on click.
- Anchors exist for platform, Cortex, workflows, trust, questions, and main
  content.
- Console: zero errors and zero warnings.
- Dynamic network: auth login/signup RSC prefetch returned 200; no failed
  dynamic request.

## Result

Existing landing behavior and responsive presentation passed this local
smoke session. No UI source change was justified. This is local functional
evidence, not a live deployment or production-readiness claim.
