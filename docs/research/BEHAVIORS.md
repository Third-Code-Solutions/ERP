# Third Code ERP public landing behaviors

## Navigation

- Fixed at viewport top with a constant glass background, border, blur, and
  shadow. Live computed styles do not change after the hero scrolls.
- Mobile navigation collapses to direct workspace and consultation actions.
- Visible mobile navigation controls are at least 44px high.

## Hero

- Original image scales from 0.92 to 1 as it enters.
- Copy remains stable and readable; no parallax on reduced-motion.
- H1 renders in three visual lines at 1440px, 768px, and 390px.
- Decorative inline heading media is hidden at 700px and below so it cannot
  create six-line mobile wrapping.

## Bento

- 12 columns by 2 rows on desktop.
- AI Brain occupies 7 columns by 2 rows.
- Operations and compliance each occupy 5 columns by 1 row.
- Mobile stacks all cards.

## Capability accordion

- Pointer hover or keyboard focus expands one panel.
- Click locks active panel for touch devices.
- Every panel keeps its heading visible when collapsed.
- Decorative ordinal labels are absent; panel names carry the interaction.

## Workflow cards

- Desktop cards overlap and stack while scrolling.
- Tablet and mobile use normal vertical flow.
- Reduced-motion uses normal vertical flow.

## Testimonial carousel

- Previous and next buttons change one quote at a time.
- No timed autoplay.
- Current position announced to assistive technology.

## FAQ and footer

- Native details/summary controls expand independently.
- Question text has no decorative ordinal prefix.
- Footer links provide at least 44px visible mobile interaction height.

## Telemetry and motion

- Vercel Analytics renders only when `VERCEL=1`.
- Self-hosted production output does not request Vercel's unavailable insights
  script.
- The primary hero image uses responsive fetch priority without a duplicate
  preload; decorative and below-fold copies remain lazy.
