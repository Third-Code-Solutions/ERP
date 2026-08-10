import {
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  projectComments,
  projects,
  users,
} from '@third-code-erp/database/schema'
import {
  projectCommentListQuerySchema,
  projectCommentListResultSchema,
  type ProjectCommentListQuery,
  type ProjectCommentListResult,
} from '@third-code-erp/shared-types'
import { and, desc, eq } from 'drizzle-orm'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { DatabaseService } from '../database/database.service'

@Injectable()
export class ProjectCommentListService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService
  ) {}

  async list(
    projectId: string,
    query: ProjectCommentListQuery,
    principal: ErpPrincipal
  ): Promise<ProjectCommentListResult> {
    const parsedQuery = projectCommentListQuerySchema.parse(query)
    const [project] = await this.database.client
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.tenant_id, principal.tenantId)
        )
      )
      .limit(1)

    if (!project) throw new NotFoundException('Project not found')

    const rows = await this.database.client
      .select({
        id: projectComments.id,
        tenantId: projectComments.tenant_id,
        projectId: projectComments.project_id,
        authorId: projectComments.author_id,
        authorName: users.full_name,
        authorEmail: users.email,
        body: projectComments.body,
        mentions: projectComments.mentions,
        createdAt: projectComments.created_at,
        updatedAt: projectComments.updated_at,
      })
      .from(projectComments)
      .leftJoin(users, eq(projectComments.author_id, users.id))
      .where(
        and(
          eq(projectComments.tenant_id, principal.tenantId),
          eq(projectComments.project_id, projectId)
        )
      )
      .orderBy(desc(projectComments.created_at), desc(projectComments.id))
      .limit(parsedQuery.limit + 1)

    const hasMore = rows.length > parsedQuery.limit
    return projectCommentListResultSchema.parse({
      tenantId: principal.tenantId,
      projectId,
      limit: parsedQuery.limit,
      hasMore,
      items: rows.slice(0, parsedQuery.limit).map((row) => ({
        id: row.id,
        tenantId: row.tenantId,
        projectId: row.projectId,
        authorId: row.authorId,
        authorName: row.authorName,
        authorEmail: row.authorEmail,
        body: row.body,
        mentions: row.mentions,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
    })
  }
}
