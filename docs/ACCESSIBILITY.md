# Accessibility Audit & Remediation Log

| Field | Value |
|---|---|
| **Audit date** | 2026-09-11 (follow-up pass) |
| **Target standard** | WCAG 2.1 Level AA |
| **Auditor** | Compound-engineering pass (automated heuristics + manual review) |
| **Scope** | Auth surfaces, dashboard shell, dashboard widgets, pipeline, BOM builder, platform administration, global styles |

---

## 1. Scope Audited

| Surface | File(s) |
|---|---|
| Global styles | `apps/web/src/app/globals.css` |
| Sidebar navigation | `apps/web/src/components/nav/sidebar.tsx` |
| Topbar | `apps/web/src/components/nav/topbar.tsx` |
| KPI section | `apps/web/src/components/dashboard/kpi-cards.tsx` |
| Pipeline-stages table | `apps/web/src/components/dashboard/stage-distribution.tsx` |
| Risk-signals panel | `apps/web/src/components/dashboard/alerts-panel.tsx` |
| Login form | `apps/web/src/app/(auth)/auth/login/login-form.tsx` |
| Signup form | `apps/web/src/app/(auth)/auth/signup/signup-form.tsx` |

This is a horizontal pass plus a focused deep-surface follow-up for the pipeline, BOM builder, and platform administration console. It is not a full WCAG conformance claim.

---

## 2. Pre-Existing Strengths

These were verified during audit and are already compliant:

- **Focus rings**: A global `:focus-visible` rule applies a 2px navy-500 outline with 2px offset to every interactive element (`globals.css` §906).
- **Sidebar `aria-label="Main navigation"`** and `aria-current="page"` on the active link.
- **Topbar breadcrumb** uses `<nav aria-label="Breadcrumb">`.
- **Sign-out button** in the sidebar already had `aria-label="Sign out"` with a `title` tooltip.
- **Login/signup inputs** were already paired with `<label htmlFor>`, `autoComplete`, and `required`.
- **Error messages** already used `role="alert"`.
- **Color contrast**:
  - Primary text `--color-neutral-900` (#171717) on white = **~16.7:1** (passes AAA).
  - `--color-navy-700` (#0f2d4a) on white = **~14:1** (passes AAA).
  - Sidebar text `rgba(255,255,255,0.72)` on `#061421` ≈ **9.8:1** (passes AA).
  - Stage badge text colors on their soft backgrounds were spot-checked above 4.5:1.
  - Gold-500 (#e07b2a) on white is **~3.0:1** — fails AA for body text but acceptable for icon strokes and accent borders only (current usage is decorative).

---

## 3. Findings & Fixes

Each row records the severity, WCAG criterion, what was wrong, and what was applied.

### 3.1 [Critical / Dashboard layout] No way to bypass repeated navigation

- **WCAG**: 2.4.1 Bypass Blocks (Level A)
- **Issue**: There is no "Skip to main content" link, so keyboard users must Tab through ~25 sidebar items on every page navigation.
- **Fix applied**: Added `.skip-link` utility CSS and wired the link to `#main-content` in `(dashboard)/layout.tsx`. The target is the protected main landmark.

### 3.2 [High / Global] No `prefers-reduced-motion` honored

- **WCAG**: 2.3.3 Animation from Interactions (Level AAA, but a baseline expectation)
- **Issue**: KPI bars animate, skeleton shimmer runs continuously, and hover/active transitions are everywhere. Users who set OS-level reduced-motion preferences had no relief.
- **Fix applied**: Added a global `@media (prefers-reduced-motion: reduce)` block to `globals.css` that clamps every `animation-duration` and `transition-duration` to 0.01ms, disables `scroll-behavior: smooth`, and caps `animation-iteration-count` to 1.

### 3.3 [High / Global] No screen-reader-only text utility

- **WCAG**: 1.3.1 Info and Relationships (Level A)
- **Issue**: Several visual-only constructs (stage-badge dots, severity icons, currency symbols) lacked text equivalents because there was no `.sr-only` helper.
- **Fix applied**: Added the canonical `.sr-only` utility class to `globals.css` and used it in stage-distribution and alerts-panel.

### 3.4 [High / Stage Distribution table] Missing caption, no row headers, no `scope`

- **WCAG**: 1.3.1 Info and Relationships (Level A), 1.3.2 Meaningful Sequence
- **Issue**: The `<table>` had no `<caption>`, the `<th>` cells in `<thead>` lacked `scope="col"`, and the stage name in each row was inside a plain `<td>` (so screen readers couldn't announce it as the row header).
- **Fix applied**:
  - Added a `<caption className="sr-only">` describing the table's content.
  - Added `scope="col"` to every header cell in `<thead>`.
  - Promoted the stage cell to `<th scope="row">` so screen readers announce stage names when reading numeric cells.
  - Added an `.sr-only` "Stage: " prefix inside the badge for unambiguous announcement.
  - Wrapped the card root in `<section aria-labelledby="pipeline-stages-heading">`.

### 3.5 [High / Alerts panel] No live region for new alerts

- **WCAG**: 4.1.3 Status Messages (Level AA)
- **Issue**: The "Risk Signals" panel updates via realtime data, but a screen reader user is never told when a new alert arrives.
- **Fix applied**:
  - Wrapped the list in `role="status" aria-live="polite" aria-relevant="additions text"`.
  - The "No active alerts" empty state also got `role="status" aria-live="polite"` so a transition from "alerts present" to "all clear" is announced.
  - Each alert row's `<Link>` now carries `aria-label="{Critical|Warning}: {label}. {detail}"` so the severity is announced alongside the title even though it's visually conveyed by color (3.3.3 isn't satisfied by color alone — see also 3.7 below).
  - The "Critical" / "Warning" group labels received `role="heading" aria-level={3}` so they appear in the heading outline.
  - The numeric badge in the header was given an explicit `aria-label="{n} active alerts"`.

### 3.6 [High / KPI cards] Non-semantic markup, decorative icons announced

- **WCAG**: 1.3.1 Info and Relationships, 1.1.1 Non-text Content
- **Issue**: KPI cards used `<div>` containers and `<p>` for labels, breaking the heading outline. Decorative icons (`IconActivity`, `IconUser`, `IconArrowUpRight` for the "Live" badge) were not marked `aria-hidden`, so screen readers would announce SVG paths.
- **Fix applied**:
  - Promoted each card to `<article aria-labelledby={labelId}>` with the label as an `<h3>`.
  - Promoted the grid wrapper to `<section aria-labelledby="kpi-section-heading">` with an `.sr-only` `<h2>` "Key performance indicators".
  - Added `aria-hidden` to all purely decorative inline-icon spans.
  - The value `<p>` now `aria-describedby` the label so the relationship is explicit.

### 3.7 [Medium / Stage badges] Color-only severity in some places

- **WCAG**: 1.4.1 Use of Color (Level A)
- **Issue**: The colored stage dot inside `stage-badge` is purely decorative and the text label is always present (so the badge itself is compliant). However, in the alerts panel, the marker color (red vs amber) was the only severity cue beyond the icon.
- **Fix applied**: Added `.sr-only` "Critical: " / "Warning: " prefixes to alert rows so severity is conveyed in text as well as tone.

### 3.8 [Medium / Topbar] Icon-only buttons had terse labels

- **WCAG**: 4.1.2 Name, Role, Value (Level A)
- **Issue**: The notifications and account buttons had `aria-label="Notifications"` / `"Account"` — technically present but not action-oriented.
- **Fix applied**:
  - Notifications: `aria-label="View notifications"`.
  - Account chip: `aria-label="Account menu for {email}"` plus `aria-haspopup="menu"`.
  - Search trigger: `aria-label="Open global search (keyboard shortcut Command K)"` plus `aria-keyshortcuts="Meta+K"`.
  - Chevron-down and bell icons wrapped in `aria-hidden` spans so they aren't redundantly announced.

### 3.9 [Medium / Forms] Missing `aria-invalid` and `aria-describedby` wiring on error

- **WCAG**: 3.3.1 Error Identification (Level A), 3.3.3 Error Suggestion (Level AA)
- **Issue**: When the login or signup form errored, the error region was announced (`role="alert"`) but the inputs that caused the error were not marked invalid and were not programmatically tied to the error message. Screen reader users could not navigate from input → error description.
- **Fix applied**:
  - Added `aria-required="true"` to each required input.
  - Added `aria-invalid={hasError || undefined}` driven by form-level error state.
  - Added `aria-describedby` pointing to the error region (`login-error` / `signup-error`).
  - Added `inputMode="email"` to email inputs for better on-screen-keyboard handling.
  - Signup password gets a dedicated visible hint (`signup-password-hint`) describing the 12-character minimum, wired via `aria-describedby` (satisfies 3.3.2 Labels or Instructions).
  - Submit buttons now carry `aria-busy={isPending}` so assistive tech can announce the pending state.
  - The signup success message was wrapped in `role="status" aria-live="polite"`.
  - Each form root now has an `aria-label` ("Sign in" / "Create account") for landmark navigation.

### 3.10 [Low / Decorative icons everywhere] Inconsistent `aria-hidden`

- **WCAG**: 1.1.1 Non-text Content (Level A)
- **Issue**: Mixed treatment — some decorative icons had `aria-hidden`, others didn't.
- **Fix applied**: Audited and added `aria-hidden` to: kpi-cards badges, topbar search/bell/chevron icons. Sidebar icons (next to text labels) and the alert markers were already `aria-hidden`.

### 3.11 [High / Pipeline] Drag transitions and modal reasons lacked status feedback

- **Fix applied**: Stage movement now announces the affected opportunity and destination in a polite live region. Closed-lost and regression dialogs use labelled modal landmarks, Escape handling, focus trapping, initial focus, and focus return. The advance menu exposes menu semantics and a keyboard Escape path.

### 3.12 [High / BOM builder] Large line-item tables were not keyboard-friendly or bounded

- **Fix applied**: BOM rows are keyboard-selectable with Enter/Space, the table has a caption and scoped headers, source/provenance and DUPA disclosures remain readable, and tables larger than 200 rendered rows use a bounded semantic window with spacer rows and an announced saving state. The normal table path is retained for smaller BOMs.

### 3.13 [High / Platform administration] Restricted console needed stronger route and table semantics

- **Fix applied**: Platform navigation now marks the active route, all major directory/audit/dependency tables have captions and scoped headers, horizontal table regions are keyboard-focusable, loading/error/empty states are present, and the console has its own skip link and responsive layout.

---

## 4. Remaining Gaps (Next Pass)

These are out of scope for this pass due to file-ownership constraints, but should be picked up next:

1. **Heading hierarchy audit on each `(dashboard)/*/page.tsx`**: confirm exactly one `<h1>` per page (the `.page-title` should be `<h1>` everywhere).
2. **Document viewer**: PDF preview pages should announce page changes; verify `aria-label` on the iframe/embed.
3. **Color contrast spot-check on `.muted` cells and `--color-neutral-500` (#737373) on white**: ratio is ~4.6:1 — borderline. Consider deepening to `--color-neutral-600` (#525252, ~7:1) for body copy.
4. **Form validation patterns beyond the deep surfaces**: project create, PO submit, and less-travelled mutation forms still need a product-wide `aria-invalid` / `aria-describedby` pass.
5. **Automated audit**: axe/Lighthouse has not been run in this environment; add it to CI before making a conformance statement.

---

## 5. Running an Accessibility Audit Locally

We do not yet ship `axe-core` in the project. Recommended approach:

### Option A: Browser extension (fastest)
1. Install the **axe DevTools** browser extension (Chrome or Firefox).
2. Open the app at `http://localhost:3000`.
3. Open DevTools → "axe DevTools" panel → **Scan ALL of my page**.
4. Triage Critical and Serious issues first.

### Option B: Playwright + axe (CI-friendly)
```bash
pnpm --filter @third-code-erp/web add -D @axe-core/playwright
```
Then in an existing Playwright test:
```ts
import AxeBuilder from '@axe-core/playwright';

test('dashboard has no detectable a11y violations', async ({ page }) => {
  await page.goto('/dashboard');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});
```
Wire this into the `e2e` job in `.github/workflows/ci.yml` and gate merges on zero serious-or-critical violations.

### Option C: Lighthouse
```bash
npx lighthouse http://localhost:3000/dashboard --only-categories=accessibility --view
```
Target **score ≥ 95**.

---

## 6. Sign-off

The follow-up covers the surfaces listed in §1 and closes the tracked skip-link, pipeline, BOM, and platform-console findings. It does **not** constitute a full WCAG 2.1 AA conformance claim: the remaining gaps and an automated axe/Lighthouse run are still required.
