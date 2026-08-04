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

## 2026-08-04 measured live recheck

Target: `https://thirdcode-erp.vercel.app/`. Playwright captures: 1440x1000,
768x900, 390x844. Desktop document height 8,823px; mobile 10,688px. Console
errors: 0. No horizontal overflow beyond the browser scrollbar. Live landing
font is Satoshi; no video elements; three rendered instances of
`/images/third-code-erp-hero.png`.

### Page-level models

| Surface | Model | Observed behavior |
| --- | --- | --- |
| Navigation | fixed + anchor/click | 68px glass nav at desktop (`top: 18px`); 62px at mobile (`top: 10px`). Links hide at 1,180px. |
| Hero media | load + scroll-driven | GSAP starts near `scale(.88)`, `opacity(.72)`, then settles to `scale(1)`. Scroll fades toward `.32` and scales to `1.04`. |
| Proof rail | time-driven | Duplicated labels move continuously; reduced motion disables animation and wraps items. |
| Platform bento | static + hover | Dense 12-column desktop grid; three interlocking cards. |
| Cortex capability accordion | click + focus + hover | One button remains `aria-expanded="true"`; active body changes. Mobile shows body only for active item. |
| Workflow cards | scroll-driven desktop | Four cards pin/stack with GSAP; mobile switches to ordinary vertical cards. |
| Priority panel | click-driven carousel | Previous/next rotates four priorities; quote is `aria-live="polite"`. |
| FAQ | native disclosure | Five `<details>` rows can be open independently. |
| Cortex preview | click-driven, read-only | Three sample questions replace answer/source chips. No fetch, mutation, approval, or DB write. |

### Scroll and responsive samples

- Navigation remains fixed with `background: rgba(7, 19, 31, 0.78)`, 12px
  radius, and `0 18px 56px rgba(0, 0, 0, 0.2)` shadow.
- Hero media opacity samples: `1.0` at top, `.7134` at 120px, `.5339` at
  620px, `.3626` at 1,100px, `.32` by 4,300px.
- Workflow first cards begin scaling near `scrollY≈4,300`; by `≈5,600` all
  four show pinned transforms.
- 1440px: two-column editorial hero, visible nav links, dense bento, pinned
  workflow.
- 768px: nav links hidden; one-column hero; 48px/43.68px H1; bento remains
  grid; workflow becomes normal flex column.
- 390px: nav 355px wide and 62px high; brand subtitle/sign-in hide; hero
  padding `124px 20px 72px`; H1 41.73px/40.0608px; inline hero image hides;
  bento/workflow stack; CTA padding `76px 24px`.

### 2026-08-04 interaction sweep

- Visited all four capability buttons; exactly one active state each time.
- Opened all five FAQ summaries independently.
- Visited three next priority states: Commercial and estimating, Project
  delivery, Finance and compliance.
- Local Cortex preview switches all three `aria-pressed` states and retains
  source chips; it never calls a route.
- Hover/focus evidence: link color transition, explicit CTA/card transforms,
  and 2px copper focus outline with 4px offset.


## 2026-08-04 shared-quota-turn live summary

# Third Code ERP live landing behavior bible

Reconnaissance date: 2026-08-04. Target: `https://thirdcode-erp.vercel.app/`.
Evidence collected with Playwright at 1440x900 and 390x844, plus a scroll,
control, link, image, and console sweep. This is read-only observation of the
current live surface; it is not a release claim for the current source branch.

## Global behavior

- Page uses one `main` content region followed by a footer. Main observed height
  is about 8,341px at 1440px before footer.
- Fixed primary navigation is centered near the top: 18px from viewport top,
  12px radius, dark translucent background, deep shadow, and no observed style
  change after scrolling to 160px. It remains keyboard/link navigable.
- Horizontal capability rail repeats `CRM`, `Estimating`, `BOM`, `Procurement`,
  `Projects`, `Billing`, `Compliance`, `Warranty`, and `Cortex AI`; it is an
  intentional marquee-style overflow surface, not a page scrollbar.
- No horizontal overflow observed at 390px. Observed document scroll width was
  375px against a 390px viewport in the live browser session.
- Hero uses one H1: `Run every project with an AI brain that remembers.`
  Desktop computed font is Satoshi, 72px/65.52px, weight 500, max-width
  1152px; mobile computed font is about 41.73px/40.06px.
- Image surface uses `/images/third-code-erp-hero.png` with the alt text
  `Architectural plans, fit-out materials, and a connected operations graph in a construction workspace`.

## Page topology

1. Fixed navigation and hero: construction intelligence statement, H1,
   explanatory copy, setup/workspace links, hero image.
2. Capability marquee: CRM through Cortex AI.
3. Platform / â€œOne operating recordâ€: three expandable operating ideas.
4. Cortex section: â€œSearch is useful. Context is transformative.â€ with source-
   first capability cards.
5. Workflow section: four handoff cards from pipeline through warranty.
6. Team-priority testimonial carousel: previous/next controls and `1 / 4`
   position indicator.
7. FAQ: five native disclosure questions.
8. Final CTA: setup and workspace links.
9. Footer: Platform, Access, and Trust navigation plus company credit.

## Interaction model

- Navigation: fixed click/keyboard links with anchor jumps and auth routes.
- Platform and Cortex capability cards: click-driven disclosure controls. The
  first capability is open on load; controls expose `aria-expanded` state.
- Testimonial area: click-driven previous/next buttons with accessible labels
  `Previous team priority` and `Next team priority`.
- FAQ: native `details` disclosure model. Questions observed:
  `What does Third Code ERP connect?`, `Is it only for construction companies?`,
  `How does Cortex use company knowledge?`, `Can the AI post payments or commitments by itself?`,
  and `Does it support Philippine construction controls?`.
- Scroll: no scroll-snap or nav style transition observed in sampled 0px and
  160px states. Sections use entrance/ambient motion but preserve document
  order and readable content when motion is reduced.
- Hover: interactive links/cards use visual affordances; no browser-only
  hover proof was treated as sufficient for a future implementation change.

## Responsive evidence

### Desktop (1440px)

- Nav width 1,380px, fixed top 18px, 10px/12px padding, dark translucent
  surface, 12px radius.
- H1 width about 560px within 1,152px max-width, 72px/65.52px Satoshi.
- Main content width about 1,425px with 100% max-width.

### Mobile (390px)

- Nav width 355px, fixed, 8px/9px padding, same dark glass language.
- H1 width about 327px, 41.73px/40.06px Satoshi.
- Hero, cards, FAQ, CTA, and footer stack into one column; no horizontal
  overflow observed.

## Release boundary

Live page currently reports title `Construction ERP with a permission-aware AI
brain`. Authenticated dashboard behavior was not inferred from the public
landing. Any UI change requires a new component spec, local browser proof at
1440/768/390, clean-room scan, build, and spend-approved deployment evidence.

## Preserved audit baseline (2026-08-01 to 2026-08-02)

Earlier clean-room audit evidence remains authoritative and is retained here
alongside the 2026-08-04 recheck:

- Desktop capture: 1440x900 viewport, page scroll height approximately 8,720px.
- Mobile capture: 390x844 viewport, page scroll height approximately 9,809px.
- Tablet capture was not collected in the first pass; tablet remains an explicit
  QA gate before any landing release.
- Evidence files: docs/design-references/thirdcode-erp-live-desktop.png,
  docs/design-references/thirdcode-erp-live-mobile.png,
  docs/design-references/third-code-erp-production-desktop.png, and
  docs/design-references/third-code-erp-production-mobile.png.
- The 2026-08-02 production recheck confirmed the title
  Construction ERP with a permission-aware AI brain, visible Third Code ERP /
  Third Code Solutions Inc. branding, /auth/login, /auth/signup, #platform,
  #cortex, #workflows, and #trust links, with no vendor branding observed.
- The earlier default browser capture was approximately 9,311 CSS px tall at
  1,775px width. Treat it as evidence, not a design change.

## Historical source contract retained

- Navigation is fixed at the viewport top with a constant glass background,
  border, blur, and shadow. Mobile navigation collapses to direct workspace
  and consultation actions with controls at least 44px high.
- The hero image scales into place; copy remains readable and reduced-motion
  mode removes parallax. Decorative inline heading media is hidden at 700px and
  below to prevent mobile wrapping regressions.
- The intended bento is a dense 12-column, two-row layout: AI Brain spans 7x2,
  Operations 5x1, and Compliance 5x1. Runtime evidence wins if it diverges.
- Capability selection expands one panel on hover/focus and click locks the
  active panel for touch. Collapsed headings stay visible; no decorative
  ordinal labels are used.
- Workflow cards overlap/stack on desktop and use normal document flow on
  tablet, mobile, and reduced-motion paths.
- The testimonial/team-priority carousel is manual, has no timed autoplay, and
  announces its current position for assistive technology.
- FAQ uses native details/summary; footer links retain usable mobile
  interaction height. Analytics is conditional and no unavailable insights
  script is requested in self-hosted production output.
- The prior live audit recorded 1440px and 390px renders with no horizontal
  overflow, 24 occupied bento cells, working accordion/carousel/FAQ state,
  zero console errors/warnings, and canonical, Open Graph, Organization,
  SoftwareApplication, and FAQPage metadata. Detailed evidence remains in
  docs/research/LIVE_LANDING_AUDIT_20260801.md.

## 2026-08-04 measured live recheck

Playwright captures covered 1440x1000, 768x900, and 390x844. Desktop document
height was 8,823px; mobile was 10,688px. Console errors were 0. No horizontal
overflow was observed. The live landing uses Satoshi, no video elements, and
three rendered instances of /images/third-code-erp-hero.png.

### Page-level models

| Surface | Model | Observed behavior |
| --- | --- | --- |
| Navigation | fixed plus anchor/click | 68px glass nav at desktop (top 18px), 62px at mobile (top 10px); links hide at 1,180px. |
| Hero media | load plus scroll-driven | GSAP begins near scale .88 and opacity .72, settles to scale 1, then fades toward .32 and scales to 1.04 while leaving the hero. |
| Proof rail | time-driven | Duplicated labels move continuously; reduced motion disables animation and wraps items. |
| Platform bento | static plus hover | Dense 12-column desktop grid with three interlocking cards. |
| Cortex capability accordion | click, focus, and hover | One button remains aria-expanded=true; active body changes; mobile shows only the active body. |
| Workflow cards | scroll-driven desktop | Four cards pin/stack with GSAP; mobile switches to ordinary vertical cards. |
| Priority panel | click-driven carousel | Previous/next rotates four priorities; quote is aria-live=polite. |
| FAQ | native disclosure | Five details rows can be open independently. |
| Cortex preview | click-driven, read-only | Three sample questions replace answer/source chips; no fetch, mutation, approval, or DB write. |

### Scroll and responsive samples

- Navigation remains fixed with the observed glass background, 12px radius,
  and 0 18px 56px shadow.
- Hero media opacity samples were 1.0 at top, .7134 at 120px, .5339 at 620px,
  .3626 at 1,100px, and .32 by 4,300px.
- Workflow cards begin scaling near scrollY 4,300; by approximately 5,600 all
  four show pinned transforms.
- At 1440px the hero is two-column with visible nav links, dense bento, and
  pinned workflow.
- At 768px nav links are hidden, the hero is one-column, H1 is 48px/43.68px,
  bento remains a grid, and workflow becomes a normal flex column.
- At 390px nav is 355px wide and 62px high, brand subtitle/sign-in hide, hero
  padding is 124px 20px 72px, H1 is 41.73px/40.0608px, inline hero image
  hides, bento/workflow stack, and CTA padding is 76px 24px.

### 2026-08-04 interaction sweep

- All four capability buttons were visited; exactly one active state remained.
- All five FAQ summaries were opened independently.
- Three next priority states were visited: Commercial and estimating, Project
  delivery, and Finance and compliance.
- The local Cortex preview switched all three aria-pressed states and retained
  source chips; it never called a route.
- Hover/focus evidence included link color transitions, explicit CTA/card
  transforms, and a 2px copper focus outline with 4px offset.
