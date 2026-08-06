# M3.124 - Bounded landing carousel and image priority

## Scope

Correct public landing carousel boundary behavior without rewriting its visual
system or changing the ERP application shell.

## Changes

- Clamp team-priority state to the four valid items.
- Add native disabled states and disabled hover/opacity styling to the 44px
  previous/next controls.
- Mark above-fold hero media as a priority image.
- Add source contract assertions.

## Evidence and boundary

- Local Playwright at 1440/768/390: three-line H1, no horizontal overflow,
  first/last disabled states, zero console errors.
- One Next development LCP warning remains for a duplicated decorative hero
  asset; investigate during production-equivalent QA.
- No hosted SQL, tenant-data write, provider setting, build, or deployment.
