// SLA Checker — runs every 30 min via pg_cron / Supabase Scheduled Functions.
//
// For each open row in `sla_logs` (completed_at IS NULL AND breached_at IS NULL):
//   • Compute elapsed seconds since started_at.
//   • If elapsed >= breach_at_seconds → mark breached_at = now(), notify admins.
//   • Else if elapsed >= breach_at_seconds * warning_at_pct AND warned_at IS NULL
//     → mark warned_at = now(), notify admins with "approaching breach" subject.
//
// All Postgres access happens via PostgREST + service-role key.

import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import {
  fetchUsersByRoles,
  pgInsert,
  pgSelect,
  pgUpdate,
  sendEmail,
} from "../_shared/email.ts";
import {
  businessDaysBetween,
  dateInPhilippines,
  enabledHolidayDates,
  type PersistedHoliday,
} from "../_shared/business-days.ts";

interface SlaLogRow {
  id: string;
  tenant_id: string;
  entity_type: string;
  entity_id: string;
  sla_label: string;
  started_at: string;
  sla_seconds: unknown;
  warned_at: string | null;
  breached_at: string | null;
  completed_at: string | null;
}

interface RunSummary {
  processed: number;
  warned: number;
  breached: number;
  errors: Array<{ id: string; error: string }>;
}

const ADMIN_ROLES = ["admin", "owner"];

type CalendarHourConfig = {
  clock_type: "calendar_hours";
  breach_at_seconds: number;
  warning_at_pct: number;
};

type BusinessDayConfig = {
  clock_type: "business_days";
  breach_business_days: number;
  warning_at_pct: number;
};

type SlaConfig = CalendarHourConfig | BusinessDayConfig;

type SlaProgress = {
  elapsed: number;
  total: number;
  warningAt: number;
  unit: "business days" | "calendar hours";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isWarningPercentage(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 &&
    value <= 1;
}

function parseSlaConfig(raw: unknown): SlaConfig | null {
  if (!isRecord(raw) || !isWarningPercentage(raw.warning_at_pct)) return null;

  if (
    raw.clock_type === "business_days" &&
    isPositiveInteger(raw.breach_business_days)
  ) {
    return {
      clock_type: "business_days",
      breach_business_days: raw.breach_business_days,
      warning_at_pct: raw.warning_at_pct,
    };
  }

  if (
    (raw.clock_type === undefined || raw.clock_type === "calendar_hours") &&
    isPositiveInteger(raw.breach_at_seconds)
  ) {
    return {
      clock_type: "calendar_hours",
      breach_at_seconds: raw.breach_at_seconds,
      warning_at_pct: raw.warning_at_pct,
    };
  }

  return null;
}

async function loadTenantHolidayDates(
  tenantId: string,
): Promise<ReadonlySet<string>> {
  const rows = await pgSelect<PersistedHoliday>(
    "business_calendar_holidays",
    `tenant_id=eq.${
      encodeURIComponent(tenantId)
    }&select=holiday_date,is_enabled`,
  );
  return enabledHolidayDates(rows);
}

function getProgress(
  config: SlaConfig,
  startedAt: string,
  nowMs: number,
  holidayDates?: ReadonlySet<string>,
): SlaProgress {
  const started = new Date(startedAt);
  const now = new Date(nowMs);
  if (Number.isNaN(started.getTime()) || Number.isNaN(now.getTime())) {
    throw new RangeError("SLA progress requires valid dates");
  }

  if (config.clock_type === "business_days") {
    if (!holidayDates) {
      throw new Error("business calendar is required for business-day SLA");
    }
    const elapsed = Math.max(
      0,
      businessDaysBetween(
        dateInPhilippines(started),
        dateInPhilippines(now),
        holidayDates,
      ),
    );
    return {
      elapsed,
      total: config.breach_business_days,
      warningAt: config.breach_business_days * config.warning_at_pct,
      unit: "business days",
    };
  }

  const elapsed = Math.max(0, (nowMs - started.getTime()) / 3_600_000);
  const total = config.breach_at_seconds / 3_600;
  return {
    elapsed,
    total,
    warningAt: total * config.warning_at_pct,
    unit: "calendar hours",
  };
}

function buildEmailBody(args: {
  label: string;
  entityType: string;
  entityId: string;
  status: "warning" | "breach";
  elapsed: number;
  total: number;
  unit: SlaProgress["unit"];
}): { subject: string; html: string; text: string } {
  const verb = args.status === "breach" ? "BREACHED" : "approaching breach";
  const subject = args.status === "breach"
    ? `SLA breached: ${args.label}`
    : `SLA approaching breach: ${args.label}`;
  const elapsed = args.elapsed.toFixed(1);
  const total = args.total.toFixed(1);
  const text = [
    `An SLA timer is ${verb}.`,
    ``,
    `Label: ${args.label}`,
    `Entity: ${args.entityType} ${args.entityId}`,
    `Elapsed: ${elapsed} ${args.unit} of ${total} ${args.unit} budget`,
    ``,
    `Open ABI OPS to review and resolve.`,
  ].join("\n");
  const html = `
    <p>An SLA timer is <strong>${verb}</strong>.</p>
    <ul>
      <li><strong>Label:</strong> ${args.label}</li>
      <li><strong>Entity:</strong> ${args.entityType} <code>${args.entityId}</code></li>
      <li><strong>Elapsed:</strong> ${elapsed} ${args.unit} of ${total} ${args.unit} budget</li>
    </ul>
    <p>Open ABI OPS to review and resolve.</p>
  `.trim();
  return { subject, html, text };
}

async function processRow(
  row: SlaLogRow,
  summary: RunSummary,
  nowMs: number,
  holidayDatesByTenant: Map<string, Promise<ReadonlySet<string>>>,
): Promise<void> {
  const cfg = parseSlaConfig(row.sla_seconds);
  if (!cfg) {
    summary.errors.push({ id: row.id, error: "invalid sla_seconds config" });
    return;
  }

  let holidayDates: ReadonlySet<string> | undefined;
  if (cfg.clock_type === "business_days") {
    let pending = holidayDatesByTenant.get(row.tenant_id);
    if (!pending) {
      pending = loadTenantHolidayDates(row.tenant_id);
      holidayDatesByTenant.set(row.tenant_id, pending);
    }
    holidayDates = await pending;
  }

  const progress = getProgress(cfg, row.started_at, nowMs, holidayDates);

  if (progress.elapsed >= progress.total) {
    const nowIso = new Date(nowMs).toISOString();
    await pgUpdate("sla_logs", `id=eq.${row.id}`, { breached_at: nowIso });

    const admins = await fetchUsersByRoles(row.tenant_id, ADMIN_ROLES);
    const { subject, html, text } = buildEmailBody({
      label: row.sla_label,
      entityType: row.entity_type,
      entityId: row.entity_id,
      status: "breach",
      elapsed: progress.elapsed,
      total: progress.total,
      unit: progress.unit,
    });

    for (const admin of admins) {
      await pgInsert("notifications", {
        tenant_id: row.tenant_id,
        recipient_user_id: admin.id,
        channel: "in_app",
        subject,
        body: text,
        payload: {
          template_id: "sla-breach",
          sla_label: row.sla_label,
          entity_type: row.entity_type,
          entity_id: row.entity_id,
          elapsed: progress.elapsed,
          unit: progress.unit,
          ...(progress.unit === "calendar hours"
            ? { elapsed_seconds: Math.floor(progress.elapsed * 3_600) }
            : {}),
        },
      });
      await sendEmail({ to: admin.email, subject, html, text });
    }
    summary.breached += 1;
    return;
  }

  if (progress.elapsed >= progress.warningAt && !row.warned_at) {
    const nowIso = new Date(nowMs).toISOString();
    await pgUpdate("sla_logs", `id=eq.${row.id}`, { warned_at: nowIso });

    const admins = await fetchUsersByRoles(row.tenant_id, ADMIN_ROLES);
    const { subject, html, text } = buildEmailBody({
      label: row.sla_label,
      entityType: row.entity_type,
      entityId: row.entity_id,
      status: "warning",
      elapsed: progress.elapsed,
      total: progress.total,
      unit: progress.unit,
    });

    for (const admin of admins) {
      await pgInsert("notifications", {
        tenant_id: row.tenant_id,
        recipient_user_id: admin.id,
        channel: "in_app",
        subject,
        body: text,
        payload: {
          template_id: "sla-breach",
          sla_label: row.sla_label,
          entity_type: row.entity_type,
          entity_id: row.entity_id,
          elapsed: progress.elapsed,
          unit: progress.unit,
          ...(progress.unit === "calendar hours"
            ? { elapsed_seconds: Math.floor(progress.elapsed * 3_600) }
            : {}),
          warning: true,
        },
      });
      await sendEmail({ to: admin.email, subject, html, text });
    }
    summary.warned += 1;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();

  const summary: RunSummary = {
    processed: 0,
    warned: 0,
    breached: 0,
    errors: [],
  };
  const nowMs = Date.now();
  const holidayDatesByTenant = new Map<string, Promise<ReadonlySet<string>>>();

  try {
    const rows = await pgSelect<SlaLogRow>(
      "sla_logs",
      "completed_at=is.null&breached_at=is.null&select=*",
    );

    for (const row of rows) {
      summary.processed += 1;
      try {
        await processRow(row, summary, nowMs, holidayDatesByTenant);
      } catch (err) {
        summary.errors.push({
          id: row.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return jsonResponse(summary);
  } catch (err) {
    return jsonResponse(
      {
        ...summary,
        fatal: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
});
