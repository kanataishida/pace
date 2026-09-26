import { describe, expect, it } from "vitest";
import {
  createImportPreview,
  parseCsv,
  parseImportAmount,
  parseImportDate,
} from "../domain/cardImport";
import type { Expense } from "../types";

describe("カードCSV取込", () => {
  it("BOM・改行・引用符・カンマを保持する", () => {
    expect(
      parseCsv(
        '\uFEFF日付,金額,店名\r\n2026/9/24,"1,280","A,B"\r\n2026/9/25,500,"C""D\n店"\r\n',
      ),
    ).toEqual([
      ["日付", "金額", "店名"],
      ["2026/9/24", "1,280", "A,B"],
      ["2026/9/25", "500", 'C"D\n店'],
    ]);
    expect(() => parseCsv('"unclosed')).toThrow();
    expect(() => parseCsv('"value"oops,1')).toThrow();
  });
  it("実在する日付だけを受け付ける", () => {
    expect(parseImportDate("２０２６年９月３０日")).toBe("2026-09-30");
    expect(parseImportDate("2026-10-1")).toBe("2026-10-01");
    expect(parseImportDate("2024/2/29")).toBe("2024-02-29");
    expect(parseImportDate("2026/2/29")).toBeNull();
    expect(parseImportDate("2026/9/31")).toBeNull();
    expect(parseImportDate("9/24")).toBeNull();
  });
  it("正の円整数だけを受け付ける", () => {
    expect(parseImportAmount("￥１,２８０円")).toBe(1280);
    expect(parseImportAmount("1280.00")).toBe(1280);
    for (const value of [
      "0",
      "-500",
      "(500)",
      "1.25",
      "1,2,80",
      "1000000000",
      "NaN",
    ])
      expect(parseImportAmount(value)).toBeNull();
  });
  it("既存履歴とファイル内の重複を検出し、カードが違う利用は除外する", () => {
    const existing = [
      {
        date: "2026-09-24",
        amount: 1280,
        merchant: "Ａ 店",
        paymentMethod: "creditCard",
        creditCardId: "card-a",
      },
    ] as Expense[];
    const rows = [
      ["2026/9/24", "1280", "a店"],
      ["2026/9/24", "500", "新しい店"],
      ["2026/9/24", "500", "新しい店"],
      ["2026/10/1", "500", "未来"],
    ];
    const preview = createImportPreview(
      rows,
      { date: 0, amount: 1, merchant: 2 },
      existing,
      "card-a",
      "2026-09-30",
    );
    expect(preview.map((row) => row.duplicate)).toEqual([
      true,
      false,
      true,
      false,
    ]);
    expect(preview[3].error).toContain("未来");
    expect(
      createImportPreview(
        rows,
        { date: 0, amount: 1, merchant: 2 },
        existing,
        "card-b",
        "2026-09-30",
      )[0].duplicate,
    ).toBe(false);
  });
});
