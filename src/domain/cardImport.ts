import type { Expense } from "../types";
import { dateKey } from "./dates";

/** RFC 4180-style parser. Keeps commas/newlines inside quotes and escaped double quotes. */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false,
    afterQuote = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else field += char;
    } else if (char === '"') {
      if (field.trim()) throw new Error("引用符の位置を確認してください。");
      quoted = true;
    } else if (char === ",") {
      row.push(field.trim());
      field = "";
      afterQuote = false;
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i++;
      row.push(field.trim());
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      field = "";
      afterQuote = false;
    } else {
      if (afterQuote && char.trim())
        throw new Error("引用符の後の文字を確認してください。");
      if (!afterQuote) field += char;
    }
  }
  if (quoted) throw new Error("閉じられていない引用符があります。");
  row.push(field.trim());
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
}

export function parseImportDate(input: string): string | null {
  const normalized = input.normalize("NFKC").trim();
  const match =
    /^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/.exec(
      normalized,
    ) ?? /^(\d{4})(\d{2})(\d{2})$/.exec(normalized);
  if (!match) return null;
  const year = Number(match[1]),
    month = Number(match[2]),
    day = Number(match[3]);
  if (year < 1900 || year > 2199 || month < 1 || month > 12 || day < 1)
    return null;
  if (day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseImportAmount(input: string): number | null {
  const normalized = input
    .normalize("NFKC")
    .trim()
    .replace(/[¥￥円\s]/g, "");
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.0+)?$/.test(normalized)) return null;
  const amount = Number(normalized.replaceAll(",", ""));
  return Number.isSafeInteger(amount) && amount > 0 && amount <= 999_999_999
    ? amount
    : null;
}

export interface ImportColumnMap {
  date: number;
  amount: number;
  merchant: number;
}
export interface ImportRow {
  line: number;
  date: string;
  amount: number;
  merchant: string;
  error?: string;
  duplicate: boolean;
}
export function importKey(
  date: string,
  amount: number,
  merchant: string,
  cardId: string,
): string {
  return JSON.stringify([
    date ? dateKey(date) : "",
    amount,
    merchant.normalize("NFKC").toLowerCase().replace(/\s/g, ""),
    cardId,
  ]);
}

export function createImportPreview(
  rows: string[][],
  columns: ImportColumnMap,
  existing: Expense[],
  cardId: string,
  today: string,
): ImportRow[] {
  const seen = new Set(
    existing
      .filter((expense) => expense.paymentMethod === "creditCard")
      .map((expense) =>
        importKey(
          expense.date,
          expense.amount,
          expense.merchant,
          expense.creditCardId ?? "",
        ),
      ),
  );
  return rows.map((row, index) => {
    const date = parseImportDate(row[columns.date] ?? "");
    const amount = parseImportAmount(row[columns.amount] ?? "");
    const merchant = (row[columns.merchant] ?? "").trim();
    const error = !date
      ? "日付は西暦の年月日で指定してください"
      : date > today
        ? "未来の利用日は取り込めません"
        : amount === null
          ? "金額は1〜999,999,999円の整数で指定してください（返金は対象外）"
          : !merchant
            ? "店名がありません"
            : undefined;
    const key = importKey(date ?? "", amount ?? 0, merchant, cardId);
    const duplicate = !error && seen.has(key);
    if (!error) seen.add(key);
    return {
      line: index + 2,
      date: date ?? "",
      amount: amount ?? 0,
      merchant,
      error,
      duplicate,
    };
  });
}
