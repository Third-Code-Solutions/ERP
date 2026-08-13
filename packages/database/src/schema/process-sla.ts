import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { tenants } from './tenants'
import { users } from './users'

/** Process clocks use business days for SD workflow and calendar hours for CX. */
export const processClockTypeEnum = pgEnum('process_clock_type', [
  'business_days',
  'calendar_hours',
])

/** External clocks are observable but can never escalate against an ABI BU. */
export const processClockScopeEnum = pgEnum('process_clock_scope', [
  'internal',
  'external',
])

export const processTaskStatusEnum = pgEnum('process_task_status', [
  'pending',
  'in_progress',
  'blocked',
  'completed',
  'cancelled',
])

export const slaClockStatusEnum = pgEnum('sla_clock_status', [
  'running',
  'paused',
  'breached',
  'escalated',
  'completed',
  'cancelled',
])

export const processApprovalStatusEnum = pgEnum('process_approval_status', [
  'pending',
  'approved',
  'rejected',
  'expired',
  'cancelled',
])

export const processSteps = pgTable(
  'process_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 64 }).notNull(),
    stage: varchar('stage', { length: 80 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    responsible_bu: varchar('responsible_bu', { length: 120 }).notNull(),
    input: text('input').notNull(),
    input_from: text('input_from').notNull(),
    output: text('output').notNull(),
    output_by: text('output_by').notNull(),
    sla_days: integer('sla_days'),
    /** Required only when is_business_days=false, e.g. CX 24h/48h clocks. */
    sla_hours: integer('sla_hours'),
    is_business_days: boolean('is_business_days').notNull().default(true),
    clock_scope: processClockScopeEnum('clock_scope')
      .notNull()
      .default('internal'),
    template_link: varchar('template_link', { length: 512 }),
    predecessor_code: varchar('predecessor_code', { length: 64 }),
    is_active: boolean('is_active').notNull().default(true),
    created_by: uuid('created_by'),
    updated_by: uuid('updated_by'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('ux_process_steps_tenant_id_id').on(
      table.tenant_id,
      table.id
    ),
    tenantCodeIdx: uniqueIndex('ux_process_steps_tenant_code').on(
      table.tenant_id,
      table.code
    ),
    tenantStageIdx: index('idx_process_steps_tenant_stage').on(
      table.tenant_id,
      table.stage,
      table.is_active
    ),
    predecessorIdx: index('idx_process_steps_tenant_predecessor').on(
      table.tenant_id,
      table.predecessor_code
    ),
    predecessorTenantFk: foreignKey({
      name: 'process_steps_predecessor_tenant_fk',
      columns: [table.tenant_id, table.predecessor_code],
      foreignColumns: [table.tenant_id, table.code],
    }).onDelete('restrict'),
    createdByTenantFk: foreignKey({
      name: 'process_steps_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    updatedByTenantFk: foreignKey({
      name: 'process_steps_updated_by_tenant_fk',
      columns: [table.tenant_id, table.updated_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    codeNonemptyCheck: check(
      'process_steps_code_nonempty',
      sql`${table.code} = btrim(${table.code}) and length(${table.code}) > 0`
    ),
    stageNonemptyCheck: check(
      'process_steps_stage_nonempty',
      sql`${table.stage} = btrim(${table.stage}) and length(${table.stage}) > 0`
    ),
    nameNonemptyCheck: check(
      'process_steps_name_nonempty',
      sql`${table.name} = btrim(${table.name}) and length(${table.name}) > 0`
    ),
    ownerNonemptyCheck: check(
      'process_steps_owner_nonempty',
      sql`${table.responsible_bu} = btrim(${table.responsible_bu}) and length(${table.responsible_bu}) > 0`
    ),
    ioNonemptyCheck: check(
      'process_steps_io_nonempty',
      sql`
        ${table.input} = btrim(${table.input}) and length(${table.input}) > 0
        and ${table.input_from} = btrim(${table.input_from}) and length(${table.input_from}) > 0
        and ${table.output} = btrim(${table.output}) and length(${table.output}) > 0
        and ${table.output_by} = btrim(${table.output_by}) and length(${table.output_by}) > 0
      `
    ),
    ownerResolvedCheck: check(
      'process_steps_owner_resolved',
      sql`${table.responsible_bu} not like '%?%'`
    ),
    clockDurationCheck: check(
      'process_steps_clock_duration',
      sql`(
        (${table.is_business_days} = true and ${table.sla_days} is not null and ${table.sla_days} > 0 and ${table.sla_hours} is null)
        or
        (${table.is_business_days} = false and ${table.sla_hours} is not null and ${table.sla_hours} > 0 and ${table.sla_days} is null)
      )`
    ),
  })
)

export const taskInstances = pgTable(
  'task_instances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    process_step_id: uuid('process_step_id').notNull(),
    subject_type: varchar('subject_type', { length: 64 }).notNull(),
    subject_id: uuid('subject_id').notNull(),
    instance_key: varchar('instance_key', { length: 255 }).notNull(),
    assigned_to: uuid('assigned_to'),
    status: processTaskStatusEnum('status').notNull().default('pending'),
    blocked_reason: text('blocked_reason'),
    started_at: timestamp('started_at', { withTimezone: true }),
    completed_at: timestamp('completed_at', { withTimezone: true }),
    created_by: uuid('created_by'),
    updated_by: uuid('updated_by'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('ux_task_instances_tenant_id_id').on(
      table.tenant_id,
      table.id
    ),
    tenantInstanceKeyIdx: uniqueIndex(
      'ux_task_instances_tenant_instance_key'
    ).on(table.tenant_id, table.instance_key),
    subjectIdx: index('idx_task_instances_tenant_subject').on(
      table.tenant_id,
      table.subject_type,
      table.subject_id
    ),
    statusIdx: index('idx_task_instances_tenant_status').on(
      table.tenant_id,
      table.status,
      table.updated_at
    ),
    processStepIdx: index('idx_task_instances_tenant_process_step').on(
      table.tenant_id,
      table.process_step_id
    ),
    processStepTenantFk: foreignKey({
      name: 'task_instances_process_step_tenant_fk',
      columns: [table.tenant_id, table.process_step_id],
      foreignColumns: [processSteps.tenant_id, processSteps.id],
    }).onDelete('restrict'),
    assignedToTenantFk: foreignKey({
      name: 'task_instances_assigned_to_tenant_fk',
      columns: [table.tenant_id, table.assigned_to],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    createdByTenantFk: foreignKey({
      name: 'task_instances_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    updatedByTenantFk: foreignKey({
      name: 'task_instances_updated_by_tenant_fk',
      columns: [table.tenant_id, table.updated_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    subjectTypeNonemptyCheck: check(
      'task_instances_subject_type_nonempty',
      sql`${table.subject_type} = btrim(${table.subject_type}) and length(${table.subject_type}) > 0`
    ),
    instanceKeyNonemptyCheck: check(
      'task_instances_instance_key_nonempty',
      sql`${table.instance_key} = btrim(${table.instance_key}) and length(${table.instance_key}) > 0`
    ),
    blockedReasonCheck: check(
      'task_instances_blocked_reason',
      sql`${table.status} <> 'blocked' or (${table.blocked_reason} is not null and length(btrim(${table.blocked_reason})) > 0)`
    ),
  })
)

export const slaClocks = pgTable(
  'sla_clocks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    task_instance_id: uuid('task_instance_id').notNull(),
    clock_type: processClockTypeEnum('clock_type').notNull(),
    clock_scope: processClockScopeEnum('clock_scope').notNull(),
    /** Snapshot: days for business_days, hours for calendar_hours. */
    target_value: integer('target_value').notNull(),
    started_at: timestamp('started_at', { withTimezone: true }).notNull(),
    due_at: timestamp('due_at', { withTimezone: true }).notNull(),
    at_risk_at: timestamp('at_risk_at', { withTimezone: true }).notNull(),
    escalation_at: timestamp('escalation_at', { withTimezone: true }),
    breached_at: timestamp('breached_at', { withTimezone: true }),
    escalated_at: timestamp('escalated_at', { withTimezone: true }),
    paused_reason: text('paused_reason'),
    status: slaClockStatusEnum('status').notNull().default('running'),
    /** Defaults true for the 4–6 week BU-level observation period. */
    observe_mode: boolean('observe_mode').notNull().default(true),
    created_by: uuid('created_by'),
    updated_by: uuid('updated_by'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('ux_sla_clocks_tenant_id_id').on(
      table.tenant_id,
      table.id
    ),
    activeTaskIdx: uniqueIndex('ux_sla_clocks_active_task')
      .on(table.tenant_id, table.task_instance_id)
      .where(sql`${table.status} not in ('completed', 'cancelled')`),
    dueStatusIdx: index('idx_sla_clocks_tenant_due_status').on(
      table.tenant_id,
      table.status,
      table.due_at
    ),
    scopeStatusIdx: index('idx_sla_clocks_tenant_scope_status').on(
      table.tenant_id,
      table.clock_scope,
      table.status
    ),
    taskInstanceTenantFk: foreignKey({
      name: 'sla_clocks_task_instance_tenant_fk',
      columns: [table.tenant_id, table.task_instance_id],
      foreignColumns: [taskInstances.tenant_id, taskInstances.id],
    }).onDelete('cascade'),
    createdByTenantFk: foreignKey({
      name: 'sla_clocks_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    updatedByTenantFk: foreignKey({
      name: 'sla_clocks_updated_by_tenant_fk',
      columns: [table.tenant_id, table.updated_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    targetValueCheck: check(
      'sla_clocks_target_value_positive',
      sql`${table.target_value} > 0`
    ),
    scheduleCheck: check(
      'sla_clocks_schedule_order',
      sql`${table.started_at} <= ${table.at_risk_at} and ${table.at_risk_at} <= ${table.due_at} and (${table.escalation_at} is null or ${table.due_at} <= ${table.escalation_at})`
    ),
    externalNoEscalationCheck: check(
      'sla_clocks_external_never_escalates',
      sql`(
        (${table.clock_scope} = 'internal' and ${table.escalation_at} is not null)
        or
        (${table.clock_scope} = 'external' and ${table.escalation_at} is null and ${table.escalated_at} is null and ${table.status} <> 'escalated')
      )`
    ),
    pausedReasonCheck: check(
      'sla_clocks_paused_reason',
      sql`${table.status} <> 'paused' or (${table.paused_reason} is not null and length(btrim(${table.paused_reason})) > 0)`
    ),
  })
)

export const approvalRules = pgTable(
  'approval_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    object_type: varchar('object_type', { length: 64 }).notNull(),
    /** Monetary bands are integer PHP centavos; no floating-point values. */
    amount_band_low: bigint('amount_band_low', { mode: 'bigint' })
      .notNull(),
    amount_band_high: bigint('amount_band_high', {
      mode: 'bigint',
    }),
    approver_role: varchar('approver_role', { length: 80 }).notNull(),
    sequence: integer('sequence').notNull(),
    /** Approval-rule escalation is measured in business days. */
    escalation_after_days: integer('escalation_after_days'),
    is_active: boolean('is_active').notNull().default(true),
    created_by: uuid('created_by'),
    updated_by: uuid('updated_by'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('ux_approval_rules_tenant_id_id').on(
      table.tenant_id,
      table.id
    ),
    lookupIdx: index('idx_approval_rules_tenant_lookup').on(
      table.tenant_id,
      table.object_type,
      table.amount_band_low,
      table.amount_band_high,
      table.sequence
    ),
    activeIdx: index('idx_approval_rules_tenant_active').on(
      table.tenant_id,
      table.is_active
    ),
    createdByTenantFk: foreignKey({
      name: 'approval_rules_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    updatedByTenantFk: foreignKey({
      name: 'approval_rules_updated_by_tenant_fk',
      columns: [table.tenant_id, table.updated_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    objectTypeNonemptyCheck: check(
      'approval_rules_object_type_nonempty',
      sql`${table.object_type} = btrim(${table.object_type}) and length(${table.object_type}) > 0`
    ),
    approverRoleNonemptyCheck: check(
      'approval_rules_approver_role_nonempty',
      sql`${table.approver_role} = btrim(${table.approver_role}) and length(${table.approver_role}) > 0`
    ),
    amountBandCheck: check(
      'approval_rules_amount_band_valid',
      sql`${table.amount_band_low} >= 0 and (${table.amount_band_high} is null or ${table.amount_band_high} >= ${table.amount_band_low})`
    ),
    sequenceCheck: check(
      'approval_rules_sequence_positive',
      sql`${table.sequence} > 0`
    ),
    escalationDaysCheck: check(
      'approval_rules_escalation_days_positive',
      sql`${table.escalation_after_days} is null or ${table.escalation_after_days} > 0`
    ),
  })
)

export const approvals = pgTable(
  'approvals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    object_type: varchar('object_type', { length: 64 }).notNull(),
    object_id: uuid('object_id').notNull(),
    approval_rule_id: uuid('approval_rule_id').notNull(),
    sequence: integer('sequence').notNull(),
    approver_user_id: uuid('approver_user_id'),
    status: processApprovalStatusEnum('status').notNull().default('pending'),
    requested_at: timestamp('requested_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    decided_at: timestamp('decided_at', { withTimezone: true }),
    decision_note: text('decision_note'),
    created_by: uuid('created_by'),
    updated_by: uuid('updated_by'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('ux_approvals_tenant_id_id').on(
      table.tenant_id,
      table.id
    ),
    objectSequenceIdx: uniqueIndex('ux_approvals_tenant_object_sequence').on(
      table.tenant_id,
      table.object_type,
      table.object_id,
      table.sequence
    ),
    statusIdx: index('idx_approvals_tenant_status').on(
      table.tenant_id,
      table.status,
      table.requested_at
    ),
    approvalRuleTenantFk: foreignKey({
      name: 'approvals_rule_tenant_fk',
      columns: [table.tenant_id, table.approval_rule_id],
      foreignColumns: [approvalRules.tenant_id, approvalRules.id],
    }).onDelete('restrict'),
    approverUserTenantFk: foreignKey({
      name: 'approvals_approver_user_tenant_fk',
      columns: [table.tenant_id, table.approver_user_id],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    createdByTenantFk: foreignKey({
      name: 'approvals_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    updatedByTenantFk: foreignKey({
      name: 'approvals_updated_by_tenant_fk',
      columns: [table.tenant_id, table.updated_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    objectTypeNonemptyCheck: check(
      'approvals_object_type_nonempty',
      sql`${table.object_type} = btrim(${table.object_type}) and length(${table.object_type}) > 0`
    ),
    sequenceCheck: check('approvals_sequence_positive', sql`${table.sequence} > 0`),
    decisionStateCheck: check(
      'approvals_decision_state',
      sql`(
        (${table.status} = 'pending' and ${table.decided_at} is null)
        or
        (${table.status} <> 'pending' and ${table.decided_at} is not null)
      )`
    ),
    rejectionNoteCheck: check(
      'approvals_rejection_note',
      sql`${table.status} <> 'rejected' or (${table.decision_note} is not null and length(btrim(${table.decision_note})) > 0)`
    ),
  })
)

export type ProcessStep = typeof processSteps.$inferSelect
export type ProcessStepInsert = typeof processSteps.$inferInsert
export type TaskInstance = typeof taskInstances.$inferSelect
export type TaskInstanceInsert = typeof taskInstances.$inferInsert
export type SlaClock = typeof slaClocks.$inferSelect
export type SlaClockInsert = typeof slaClocks.$inferInsert
export type ApprovalRule = typeof approvalRules.$inferSelect
export type ApprovalRuleInsert = typeof approvalRules.$inferInsert
export type Approval = typeof approvals.$inferSelect
export type ApprovalInsert = typeof approvals.$inferInsert
