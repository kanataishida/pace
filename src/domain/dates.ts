/** All accounting dates are Japan calendar dates, independent of device timezone. */
const jstFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1)
    return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function dateKey(value: string | Date): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    if (!isDateKey(value)) throw new Error("日付を確認してください。");
    return value;
  }
  if (
    typeof value === "string" &&
    (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) ||
      !isDateKey(value.slice(0, 10)))
  )
    throw new Error("日付を確認してください。");
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime()))
    throw new Error("日付を確認してください。");
  const parts = jstFormatter.formatToParts(parsed);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function todayJST(): string {
  return dateKey(new Date());
}
export function monthKey(value: string | Date = todayJST()): string {
  return dateKey(value).slice(0, 7);
}
export function daysInMonth(value: string): number {
  const [year, month] = value.slice(0, 7).split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
export function dateOnDay(month: string, day: number): string {
  const key = month.slice(0, 7);
  if (
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(key) ||
    !Number.isInteger(day) ||
    day < 1 ||
    day > 31
  )
    throw new Error("日付を確認してください。");
  return `${key}-${String(Math.min(day, daysInMonth(key))).padStart(2, "0")}`;
}
export function addMonthsDate(value: string, amount: number): string {
  const key = dateKey(value);
  const [year, month, day] = key.split("-").map(Number);
  const moved = new Date(Date.UTC(year, month - 1 + amount, 1));
  return dateOnDay(
    `${moved.getUTCFullYear()}-${String(moved.getUTCMonth() + 1).padStart(2, "0")}`,
    day,
  );
}
export function addDaysDate(value: string, amount: number): string {
  const key = dateKey(value);
  const parsed = new Date(`${key}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + amount);
  return parsed.toISOString().slice(0, 10);
}
export function monthStart(value: string = todayJST()): string {
  return `${monthKey(value)}-01`;
}
export function monthEnd(value: string = todayJST()): string {
  return dateOnDay(monthKey(value), 31);
}
export function remainingDaysIncludingToday(
  value: string = todayJST(),
): number {
  return daysInMonth(value) - Number(dateKey(value).slice(8, 10)) + 1;
}
export function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${dateKey(b)}T00:00:00Z`) -
      Date.parse(`${dateKey(a)}T00:00:00Z`)) /
      86_400_000,
  );
}
