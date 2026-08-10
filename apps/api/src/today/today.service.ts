import { Inject, Injectable } from '@nestjs/common'
import { dailyTasks, projects } from '@third-code-erp/database/schema'
import {
  todayCommandCenterResultSchema,
  type TodayCommandCenterResult,
  type TodayQuery,
} from '@third-code-erp/shared-types'
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  lte,
  lt,
  sql,
} from 'drizzle-orm'
import { roleHasCapability } from '../auth/capability.guard'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { DatabaseService } from '../database/database.service'
import { manilaTodayBoundaries } from './today-boundaries'

@Injectable()
export class TodayService {
  constructor(
    @Inject(DatabaseService)
    private readonly database: DatabaseService
  ) {}

  async read(
    query: TodayQuery,
    principal: ErpPrincipal,
    now = new Date()
  ): Promise<TodayCommandCenterResult> {
    const { startOfDay, endOfDay } = manilaTodayBoundaries(now)
    const weekEnd = new Date(endOfDay.getTime() + 7 * 86_400_000)
    const base = [
      eq(dailyTasks.tenant_id, principal.tenantId),
      eq(dailyTasks.assignee_id, principal.userId),
      eq(dailyTasks.status, 'pending'),
    ] as const
    const includeProjects =
      query.includeProjects && roleHasCapability(principal.role, 'project.read')

    const [todayRows, overdueRows, upcomingRows, taskRows, projectRows] =
      await Promise.all([
        this.database.client
          .select({ value: sql<number>`count(*)::int` })
          .from(dailyTasks)
          .where(
            and(
              ...base,
              gte(dailyTasks.due_date, startOfDay),
              lte(dailyTasks.due_date, endOfDay)
            )
          )
          .limit(1),
        this.database.client
          .select({ value: sql<number>`count(*)::int` })
          .from(dailyTasks)
          .where(and(...base, lt(dailyTasks.due_date, now)))
          .limit(1),
        this.database.client
          .select({ value: sql<number>`count(*)::int` })
          .from(dailyTasks)
          .where(
            and(
              ...base,
              gt(dailyTasks.due_date, endOfDay),
              lte(dailyTasks.due_date, weekEnd)
            )
          )
          .limit(1),
        this.database.client
          .select({
            id: dailyTasks.id,
            title: dailyTasks.title,
            projectId: dailyTasks.project_id,
            projectName: projects.name,
            dueDate: dailyTasks.due_date,
          })
          .from(dailyTasks)
          .innerJoin(
            projects,
            and(
              eq(projects.id, dailyTasks.project_id),
              eq(projects.tenant_id, principal.tenantId)
            )
          )
          .where(
            and(
              ...base,
              lte(dailyTasks.due_date, weekEnd)
            )
          )
          .orderBy(asc(dailyTasks.due_date))
          .limit(8),
        includeProjects
          ? this.database.client
              .select({
                id: projects.id,
                name: projects.name,
                client: projects.client,
                status: projects.status,
                updatedAt: projects.updated_at,
              })
              .from(projects)
              .where(
                and(
                  eq(projects.tenant_id, principal.tenantId),
                  inArray(projects.status, ['lead', 'active', 'on_hold'])
                )
              )
              .orderBy(desc(projects.updated_at))
              .limit(6)
          : Promise.resolve([]),
      ])

    return todayCommandCenterResultSchema.parse({
      summary: {
        dueToday: Number(todayRows[0]?.value ?? 0),
        overdue: Number(overdueRows[0]?.value ?? 0),
        upcoming: Number(upcomingRows[0]?.value ?? 0),
      },
      tasks: taskRows.map((task) => ({
        ...task,
        dueDate: task.dueDate.toISOString(),
        dueState:
          task.dueDate < now
            ? 'overdue'
            : task.dueDate <= endOfDay
              ? 'today'
              : 'upcoming',
      })),
      projects: projectRows.map((project) => ({
        ...project,
        updatedAt: project.updatedAt.toISOString(),
      })),
    })
  }
}
