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

export function enabledHolidayDates(
  rows: readonly PersistedHoliday[],
): ReadonlySet<string> {
  return new Set(
    rows.filter((row) => row.is_enabled).map((row) => {
      parseDate(row.holiday_date);
      return row.holiday_date;
    }),
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
