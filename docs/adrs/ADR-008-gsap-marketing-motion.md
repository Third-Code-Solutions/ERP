# ADR-008: GSAP for public marketing motion

**Status:** Accepted
**Date:** 2026-07-27
**Scope:** Public marketing routes only

## Context

Third Code ERP needs a premium public landing page with deterministic, scroll-linked
motion. Existing application CSS covers short UI transitions but not scoped,
scrubbed sequences or card stacking. Product screens must remain dense and calm;
marketing motion must not leak into authenticated workflows.

## Decision

Add `gsap` and `@gsap/react` to `@third-code-erp/web`.

- Register `ScrollTrigger` and `useGSAP` once in the marketing client component.
- Scope every animation to a component root so teardown is automatic.
- Use `gsap.matchMedia()` for responsive behavior.
- Disable non-essential motion for `prefers-reduced-motion: reduce`.
- Render all content visible before JavaScript. Animation enhances; it never gates.
- Keep GSAP out of dashboard, form, table, and portal bundles.

## Consequences

- Landing motion gains predictable cleanup and scroll synchronization.
- Marketing bundle grows; route-level code splitting contains the cost.
- Reduced-motion and no-JavaScript states remain complete and readable.
- Any future use outside public marketing requires a new ADR or this ADR's update.

## Verification

- Production build succeeds.
- Desktop and mobile landing screenshots show no overflow.
- Reduced-motion browser emulation shows no pinned or scrubbed movement.
- Browser console contains no GSAP or hydration errors.
