import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { tenants } from './tenants'
import { projects } from './projects'
import { users } from './users'

export const projectComments = pgTable(
  'project_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    project_id: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    author_id: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    parent_id: uuid('parent_id').references((): AnyPgColumn => projectComments.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    // UUID[] of mentioned users; populated from @email matches by the server action.
    mentions: uuid('mentions').array().notNull().default(sql`'{}'::uuid[]`),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_project_comments_tenant_id').on(table.tenant_id),
    projectCreatedIdx: index('idx_project_comments_project_created').on(table.project_id, table.created_at),
    authorIdx: index('idx_project_comments_author').on(table.author_id),
  })
)

export type ProjectComment = typeof projectComments.$inferSelect
export type ProjectCommentInsert = typeof projectComments.$inferInsert
