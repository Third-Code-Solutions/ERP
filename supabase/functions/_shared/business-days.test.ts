import {
  businessDaysBetween,
  dateInPhilippines,
  enabledHolidayDates,
} from "./business-days.ts";

Deno.test("business-day arithmetic skips weekends and persisted holidays", () => {
  const holidays = enabledHolidayDates([
    { holiday_date: "2026-04-02", is_enabled: true },
    { holiday_date: "2026-04-03", is_enabled: true },
    { holiday_date: "2026-04-06", is_enabled: false },
  ]);

  if (businessDaysBetween("2026-04-01", "2026-04-07", holidays) !== 2) {
    throw new Error("Holy Week business-day arithmetic is incorrect");
  }
});

Deno.test("Philippine local dates are used for SLA day boundaries", () => {
  if (
    dateInPhilippines(new Date("2026-04-01T16:30:00.000Z")) !== "2026-04-02"
  ) {
    throw new Error("Philippine timezone conversion is incorrect");
  }
});
