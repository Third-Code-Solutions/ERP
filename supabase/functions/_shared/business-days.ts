// Copy of packages/shared-types/src/business-days/philippine-holidays.json, the
// national seed the web app uses; business-days.test.ts fails if they differ.
import nationalHolidays from "./philippine-holidays.json" with { type: "json" };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PHILIPPINE_TIME_ZONE = "Asia/Manila";

export interface PersistedHoliday {
  holiday_date: string;
  is_enabled: boolean;
}

function parseDate(value: string): Date {
  if (!ISO_DATE.test(value)) {
    throw new RangeError(`Invalid business date: ${value}`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new RangeError(`Invalid business date: ${value}`);
  }
  return parsed;
}

export function dateInPhilippines(value: Date): string {
  if (Number.isNaN(value.getTime())) throw new RangeError("Invalid SLA date");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PHILIPPINE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

/**
 * The national seed merged with the tenant's rows, as the web app does
 * (mergeBusinessDayCalendars): a tenant row wins for its date, so a tenant can
 * add a holiday or switch a national one off.
 */
export function enabledHolidayDates(
  rows: readonly PersistedHoliday[],
): ReadonlySet<string> {
  const enabledByDate = new Map<string, boolean>(
    nationalHolidays.map((holiday) => [holiday.date, true]),
  );
  for (const row of rows) {
    parseDate(row.holiday_date);
    enabledByDate.set(row.holiday_date, row.is_enabled);
  }
  return new Set(
    [...enabledByDate].filter(([, enabled]) => enabled).map(([date]) => date),
  );
}

export function businessDaysBetween(
  start: string,
  end: string,
  holidayDates: ReadonlySet<string>,
): number {
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  if (start === end) return 0;
  if (startDate > endDate) {
    return -businessDaysBetween(end, start, holidayDates);
  }

  let count = 0;
  const cursor = new Date(startDate);
  while (cursor < endDate) {
    const date = cursor.toISOString().slice(0, 10);
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6 && !holidayDates.has(date)) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}
