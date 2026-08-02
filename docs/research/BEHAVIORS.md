# Third Code ERP landing behavior audit

Status: observed from the live deployment at `https://thirdcode-erp.vercel.app/` on 2026-08-01. This is a clean-room behavior record; it does not copy implementation code or vendor internals.

## Viewports

- Desktop capture: 1440x900 viewport, page scroll height approximately 8,720px.
- Mobile capture: 390x844 viewport, page scroll height approximately 9,809px.
- Tablet capture: not collected in this pass; treat tablet layout as an explicit QA gap.
- Screenshots: `docs/design-references/thirdcode-erp-live-desktop.png` and `docs/design-references/thirdcode-erp-live-mobile.png`.

### 2026-08-02 production recheck

- Rechecked `https://thirdcode-erp.vercel.app/` with browser automation at 1440x900 and 390x844.
- Full-page captures: `docs/design-references/third-code-erp-production-desktop.png` and `docs/design-references/third-code-erp-production-mobile.png`.
- Production title remains `Construction ERP with a permission-aware AI brain`; visible brand remains Third Code ERP / Third Code Solutions Inc.
- Accessibility snapshot confirmed the expected public route links (`/auth/login`, `/auth/signup`) and section anchors (`#platform`, `#cortex`, `#workflows`, `#trust`). No vendor branding was observed.
- Current page scroll height was approximately 9,311 CSS px at the browser's 1775px-wide default viewport. Treat the earlier 1440px measurements as the stable responsive baseline; the 2026-08-02 capture is evidence, not a design change.

## Navigation

- A rounded, fixed navigation bar is visible at the top of the page.
- At desktop it remains at x=22.5, y=18, width=1,380, height=68 while scrolling; the background and shadow were unchanged at scroll 0 and approximately 700px.
- At mobile the navigation collapses to the brand and a compact setup/action control; the full desktop link group is not shown.
- Computed desktop styling: Satoshi 16px/24px, text `rgb(245,240,232)`, background `rgba(7,19,31,.78)`, padding `10px 12px 10px 16px`, radius 12px, shadow `0 18px 56px rgba(0,0,0,.2)`.

## Hero and motion

- The hero leads with an orange uppercase eyebrow, a wide two-line headline, supporting paragraph, primary CTA, and generated architectural visual.
- Desktop hero padding is `150px 72px 88px`; the content uses a two-column grid with approximately 589px and 692px columns.
- Desktop headline: Satoshi 72px, weight 500, line-height 65.52px, letter-spacing -4.68px, max-width 1,152px.
- The visual enters with a GSAP opacity/scale/y animation. Desktop scroll behavior fades and slightly scales the visual as the hero exits; cards in the workflow stack receive scroll-linked transforms. Reduced-motion mode clears those transforms.
- At mobile, the hero stacks into one column and the visual follows the copy; motion is reduced by the desktop breakpoint and reduced-motion media query.

## Interactive modules

- Platform capability cards use a selected capability state. Selecting Find anything, Understand context, Move work forward, or Prove every decision updates the detail panel without navigation.
- The team-priority section is a one-card-at-a-time carousel with previous/next controls and a bounded index.
- FAQ entries use native disclosure behavior; opening one reveals the answer in place.
- Primary CTA and navigation links are standard links. No destructive action is present on the public page.
- Hover/focus affordances use short color, border, and transform transitions; keyboard focus remains visible.

## Responsive behavior

- Desktop shows the full nav, two-column hero, dense platform grid, stacked workflow cards, and two-column footer.
- Mobile shows a single-column reading order, compact nav, full-width cards, and larger vertical spacing between sections.
- All observed interactions remain usable without relying on hover. Tablet behavior must be verified before a new landing-page release.

## Safety and content observations

- Public copy consistently identifies the product as Third Code ERP and Cortex.
- The page states that high-impact actions require authorized human approval; the marketing surface does not claim autonomous financial posting.
- No ERPNext/Frappe branding or copied vendor interface was observed in the rendered page.

## Historical source contract retained

The existing repository contract remains part of the audit record:

- Navigation is fixed at the viewport top with a constant glass background,
  border, blur, and shadow; mobile navigation collapses to direct workspace
  and consultation actions, with visible controls at least 44px high.
- The hero image scales into place; copy remains readable and reduced-motion
  mode removes parallax. Decorative inline heading media is hidden at 700px and
  below to avoid mobile wrapping regressions.
- The source design calls for a dense 12-column, two-row bento: AI Brain spans
  7x2, Operations 5x1, and Compliance 5x1. The live capture should be treated
  as the current runtime evidence if it diverges from this historical intent.
- Capability selection expands one panel on hover/focus and click locks the
  active panel for touch; collapsed headings remain visible and no decorative
  ordinal labels are used.
- Workflow cards overlap/stack on desktop and use normal document flow on
  tablet/mobile/reduced-motion paths.
- The testimonial/team-priority carousel is manual, has no timed autoplay, and
  announces its current position for assistive technology.
- FAQ uses native `details`/`summary`; footer links retain usable mobile
  interaction height. Analytics is conditional and no unavailable insights
  script is requested in self-hosted production output.
- The prior live audit recorded 1440px and 390px renders with no horizontal
  overflow, 24 occupied bento cells, working accordion/carousel/FAQ state,
  zero console errors/warnings, and canonical/Open Graph/
  Organization/SoftwareApplication/FAQPage metadata. The detailed evidence is
  retained in `docs/research/LIVE_LANDING_AUDIT_20260801.md`.
