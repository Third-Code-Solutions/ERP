import {
  businessDaysBetween,
  dateInPhilippines,
  enabledHolidayDates,
} from "./business-days.ts";
import nationalHolidays from "./philippine-holidays.json" with { type: "json" };
import webNationalHolidays from "../../../packages/shared-types/src/business-days/philippine-holidays.json" with {
  type: "json",
};

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

Deno.test("the national holiday seed matches the web app's copy", () => {
  if (JSON.stringify(nationalHolidays) !== JSON.stringify(webNationalHolidays)) {
    throw new Error(
      "supabase/functions/_shared/philippine-holidays.json differs from packages/shared-types",
    );
  }
});

Deno.test("national holidays count without tenant rows, and a tenant row can switch one off", () => {
  // Fri 27 Nov to Wed 2 Dec 2026 counts Fri and Tue; Mon 30 Nov is Bonifacio Day.
  if (businessDaysBetween("2026-11-27", "2026-12-02", enabledHolidayDates([])) !== 2) {
    throw new Error("the national seed is not applied");
  }
  const switchedOff = enabledHolidayDates([
    { holiday_date: "2026-11-30", is_enabled: false },
  ]);
  if (businessDaysBetween("2026-11-27", "2026-12-02", switchedOff) !== 3) {
    throw new Error("a disabled tenant row does not replace the national holiday");
  }
});
