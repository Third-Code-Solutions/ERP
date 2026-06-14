// Plain constants module — NOT a "use server" file, so it is safe to import
// from client components (the role dropdowns). Exporting this from the
// server-actions file made client imports resolve to a server-action
// reference instead of the array, which crashed the detail/create pages.

// All ABI Ops roles (canonical + legacy retained for back-compat).
export const ASSIGNABLE_ROLES = [
  'admin',
  'sales',
  'commercial',
  'design',
  'sd_pm_pe',
  'finance',
  'procurement',
  'safety',
  'cx',
  'viewer',
  // Legacy values — assignable but de-prioritised in UI.
  'owner',
  'estimator',
  'pm',
] as const

export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number]
