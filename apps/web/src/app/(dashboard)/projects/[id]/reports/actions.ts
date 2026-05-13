'use server'

// Phase 10 (Rework-alignment) — Weekly Report server actions.
//
// Two entry points:
//   - generateThisWeekReport(projectId): used by the "Generate this week"
//     CTA on the reports list. Picks the upcoming Sunday EOD Manila as the
//     week boundary so re-runs mid-week land on the same row.
//   - regenerateWeeklyReport(reportId): re-runs the orchestrator against
//     an existing report's week_ending — useful when more updates land
//     mid-week and the user wants a fresh snapshot.

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { requireUserProfile, can } from '@buildops/auth'
import { db } from '@buildops/database'
import { projects, weeklyReports } from '@buildops/database/schema'
import {
  generateWeeklyReportForProject,
  upcomingSundayEndOfDayManila,
} from '@/lib/reports/generate-weekly-report'

export async function generateThisWeekReport(
  projectId: string
): Promise<{ error?: string; id?: string }> {
  if (typeof projectId !== 'string' || !projectId) {
    return { error: 'Missing projectId' }
  }

  let profile
  try {
    profile = await requireUserProfile()
  } catch {
    return { error: 'Unauthorized' }
  }

  if (!can(profile.role, 'precon.manage_checklist')) {
    return {
      error: `Forbidden: role "${profile.role}" lacks "precon.manage_checklist"`,
    }
  }

  // Tenant scope the project before doing any heavy work.
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(eq(projects.id, projectId), eq(projects.tenant_id, profile.tenantId))
    )
    .limit(1)
  if (!project) return { error: 'Project not found' }

  const weekEnding = upcomingSundayEndOfDayManila()

  try {
    const { id } = await generateWeeklyReportForProject(
      profile.tenantId,
      projectId,
      weekEnding,
      profile.user.id
    )
    revalidatePath(`/projects/${projectId}/reports`)
    return { id }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate report'
    console.error('[weekly-report/actions] generate failed:', err)
    return { error: message }
  }
}

export async function regenerateWeeklyReport(
  reportId: string
): Promise<{ error?: string }> {
  if (typeof reportId !== 'string' || !reportId) {
    return { error: 'Missing reportId' }
  }

  let profile
  try {
    profile = await requireUserProfile()
  } catch {
    return { error: 'Unauthorized' }
  }

  if (!can(profile.role, 'precon.manage_checklist')) {
    return {
      error: `Forbidden: role "${profile.role}" lacks "precon.manage_checklist"`,
    }
  }

  const [existing] = await db
    .select({
      id: weeklyReports.id,
      project_id: weeklyReports.project_id,
      week_ending: weeklyReports.week_ending,
    })
    .from(weeklyReports)
    .where(
      and(
        eq(weeklyReports.id, reportId),
        eq(weeklyReports.tenant_id, profile.tenantId)
      )
    )
    .limit(1)

  if (!existing) return { error: 'Report not found' }

  try {
    await generateWeeklyReportForProject(
      profile.tenantId,
      existing.project_id,
      new Date(existing.week_ending),
      profile.user.id
    )
    revalidatePath(`/projects/${existing.project_id}/reports`)
    return {}
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to regenerate report'
    console.error('[weekly-report/actions] regenerate failed:', err)
    return { error: message }
  }
}
