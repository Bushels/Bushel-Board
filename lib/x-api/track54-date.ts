export const TRACK54_AUTOMATION_TIME_ZONE = "America/Edmonton";

function dateKeyFromParts(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error(`Unable to format date in ${timeZone}.`);
  }
  return `${year}-${month}-${day}`;
}

export function track54AutomationDateKey(
  date = new Date(),
  timeZone = TRACK54_AUTOMATION_TIME_ZONE,
): string {
  return dateKeyFromParts(date, timeZone);
}

function localMinutesSinceMidnight(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value;
  const minute = parts.find((part) => part.type === "minute")?.value;
  if (!hour || !minute) {
    throw new Error(`Unable to format local time in ${timeZone}.`);
  }
  return Number(hour) * 60 + Number(minute);
}

function addDateKeyDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekdayForDateKey(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00Z`).getUTCDay();
}

export function track54CompletedAutomationDateKey(
  date = new Date(),
  options: {
    timeZone?: string;
    activeWeekdays?: number[];
    cutoffHour?: number;
    cutoffMinute?: number;
  } = {},
): string {
  const timeZone = options.timeZone ?? TRACK54_AUTOMATION_TIME_ZONE;
  const activeWeekdays = options.activeWeekdays ?? [1, 2, 3, 4, 5];
  const cutoffHour = options.cutoffHour ?? 16;
  const cutoffMinute = options.cutoffMinute ?? 10;
  const currentDateKey = track54AutomationDateKey(date, timeZone);
  const currentWeekday = weekdayForDateKey(currentDateKey);
  const cutoffMinutes = cutoffHour * 60 + cutoffMinute;
  const currentRunComplete =
    activeWeekdays.includes(currentWeekday) &&
    localMinutesSinceMidnight(date, timeZone) >= cutoffMinutes;

  let cursor = currentRunComplete ? currentDateKey : addDateKeyDays(currentDateKey, -1);
  while (!activeWeekdays.includes(weekdayForDateKey(cursor))) {
    cursor = addDateKeyDays(cursor, -1);
  }
  return cursor;
}
