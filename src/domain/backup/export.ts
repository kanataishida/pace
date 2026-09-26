import { APP_NAME, paymentLabels, type AppData } from "../../types";
import { monthKey } from "../dates";

type Cell = string | number;
// Text cells are prefixed before CSV quoting: spreadsheet formulas must never execute.
function csvCell(value: Cell): string {
  let string = String(value);
  if (typeof value === "string" && /^[\s\u0000-\u001f]*[=+@-]/.test(string))
    string = `'${string}`;
  return `"${string.replaceAll('"', '""')}"`;
}
function expenseRows(data: AppData): Cell[][] {
  return [...data.expenses]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => {
      const category = data.categories.find(
        (value) => value.id === row.categoryId,
      );
      return [
        row.date,
        "支出",
        row.merchant || row.description,
        row.amount,
        category?.name ?? "",
        category?.subcategories.find((value) => value.id === row.subcategoryId)
          ?.name ?? "",
        paymentLabels[row.paymentMethod],
        data.cards.find((value) => value.id === row.creditCardId)?.name ?? "",
        row.memo,
      ];
    });
}
function incomeRows(data: AppData): Cell[][] {
  return data.incomes.map((row) => [
    row.date,
    "収入",
    row.source,
    row.amount,
    row.type === "salary"
      ? "給与"
      : row.type === "temporary"
        ? "臨時収入"
        : "その他",
    "",
    "",
    "",
    row.memo,
  ]);
}
export function buildCSV(data: AppData): string {
  const header = [
    "日付",
    "種類",
    "店・内容",
    "金額",
    "カテゴリー",
    "サブカテゴリー",
    "支払方法",
    "カード",
    "メモ",
  ];
  const payments = data.cardPayments.map((row) => [
    row.date,
    "カード支払",
    data.cards.find((card) => card.id === row.creditCardId)?.name ?? "",
    row.amount,
    "",
    "",
    "銀行引落",
    "",
    row.memo,
  ]);
  const debts = data.repayments.map((row) => [
    row.date,
    "借金返済",
    data.debts.find((debt) => debt.id === row.debtId)?.title ?? "",
    row.amount,
    "",
    "",
    "",
    "",
    row.memo,
  ]);
  const savings = data.savingsContributions.map((row) => [
    row.date,
    "貯金移動",
    data.savingsGoals.find((goal) => goal.id === row.savingsGoalId)?.name ?? "",
    row.amount,
    "",
    "",
    "",
    "",
    row.memo,
  ]);
  const rows = [
    ...expenseRows(data),
    ...incomeRows(data),
    ...payments,
    ...debts,
    ...savings,
  ].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return (
    "\uFEFF" +
    [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")
  );
}

/** ExcelJS is loaded only when exporting to avoid adding it to the application startup bundle. */
export async function buildExcel(data: AppData): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = APP_NAME;
  workbook.created = new Date();
  const addSheet = (name: string, header: string[], rows: Cell[][]) => {
    const sheet = workbook.addWorksheet(name, {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    sheet.columns = header.map((title) => ({
      header: title,
      width:
        title === "メモ" || title === "店・内容"
          ? 30
          : title === "日付"
            ? 24
            : 20,
    }));
    sheet.addRows(rows);
    sheet.getRow(1).height = 28;
    sheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF183E4B" },
      };
      cell.alignment = { vertical: "middle" };
    });
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(1, sheet.rowCount), column: header.length },
    };
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1)
        row.eachCell((cell) => {
          if (typeof cell.value === "number") cell.numFmt = "#,##0";
          cell.alignment = { vertical: "middle", wrapText: true };
        });
    });
  };
  const sum = (rows: { amount: number }[]) =>
    rows.reduce((total, row) => total + row.amount, 0);
  addSheet(
    "概要",
    ["項目", "金額・内容"],
    [
      ["出力日時", new Date().toISOString()],
      ["総収入", sum(data.incomes)],
      ["生活支出（購入日）", sum(data.expenses)],
      ["借金返済", sum(data.repayments)],
      ["貯金移動", sum(data.savingsContributions)],
      ["カード支払（二重計上対象外）", sum(data.cardPayments)],
      ["保存先", "この端末のIndexedDBのみ"],
    ],
  );
  const header = [
    "日付",
    "種類",
    "店・内容",
    "金額",
    "カテゴリー",
    "サブカテゴリー",
    "支払方法",
    "カード",
    "メモ",
  ];
  addSheet("支出", header, expenseRows(data));
  addSheet("収入", header, incomeRows(data));
  addSheet(
    "カード",
    [
      "カード名",
      "下4桁",
      "締め日",
      "支払日",
      "初期未払い",
      "利用額",
      "支払済み",
      "現在未払い",
    ],
    data.cards.map((card) => {
      const used = sum(
        data.expenses.filter(
          (row) =>
            row.creditCardId === card.id && row.paymentMethod === "creditCard",
        ),
      );
      const paid = sum(
        data.cardPayments.filter((row) => row.creditCardId === card.id),
      );
      return [
        card.name,
        card.last4,
        card.closingDay,
        card.paymentDay,
        card.openingOutstanding,
        used,
        paid,
        Math.max(0, card.openingOutstanding + used - paid),
      ];
    }),
  );
  addSheet(
    "借金",
    [
      "貸主",
      "内容",
      "元の借入",
      "開始残高",
      "記録した返済",
      "現在残高",
      "月の返済予定",
      "概算",
    ],
    data.debts.map((debt) => {
      const paid = sum(data.repayments.filter((row) => row.debtId === debt.id));
      return [
        debt.lenderName,
        debt.title,
        debt.originalAmount,
        debt.openingBalance,
        paid,
        Math.max(0, debt.openingBalance - paid),
        debt.plannedMonthlyPayment,
        debt.isEstimated ? "概算" : "確定",
      ];
    }),
  );
  addSheet(
    "固定費",
    ["内容", "金額", "頻度", "支払日", "支払方法", "状態", "メモ"],
    data.recurringExpenses.map((row) => [
      row.name,
      row.amount,
      row.frequency === "monthly" ? "毎月" : "毎年",
      row.dueDay,
      paymentLabels[row.paymentMethod],
      row.isActive ? "有効" : "停止",
      row.note,
    ]),
  );
  const months = [
    ...new Set([
      ...data.expenses.map((row) => monthKey(row.date)),
      ...data.incomes.map((row) => monthKey(row.date)),
      ...data.repayments.map((row) => monthKey(row.date)),
      ...data.savingsContributions.map((row) => monthKey(row.date)),
    ]),
  ].sort();
  addSheet(
    "月別集計",
    ["月", "収入", "生活支出", "収入−生活支出", "借金返済", "貯金移動"],
    months.map((month) => {
      const income = sum(
        data.incomes.filter((row) => monthKey(row.date) === month),
      );
      const expense = sum(
        data.expenses.filter((row) => monthKey(row.date) === month),
      );
      return [
        month,
        income,
        expense,
        income - expense,
        sum(data.repayments.filter((row) => monthKey(row.date) === month)),
        sum(
          data.savingsContributions.filter(
            (row) => monthKey(row.date) === month,
          ),
        ),
      ];
    }),
  );
  addSheet(
    "カテゴリー別集計",
    ["カテゴリー", "件数", "生活支出"],
    data.categories.map((category) => {
      const rows = data.expenses.filter(
        (row) => row.categoryId === category.id,
      );
      return [category.name, rows.length, sum(rows)];
    }),
  );
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([new Uint8Array(buffer)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
