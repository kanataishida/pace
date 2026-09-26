import "fake-indexeddb/auto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  clearAllData,
  db,
  defaultCategories,
  deleteExpense,
  findDuplicateExpenses,
  initializeDb,
  readAppData,
  reconcileLiquidBalance,
  restoreAppData,
  saveExpense,
  updateSettings,
} from "../db";
import type { Expense } from "../types";
import { computeFinance } from "../domain/finance";
import { validateData } from "../domain/backup/schema";

const stamped = {
  createdAt: "2026-09-24T12:00:00+09:00",
  updatedAt: "2026-09-24T12:00:00+09:00",
};
function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    ...stamped,
    id: "expense",
    amount: 1280,
    date: "2026-09-24",
    merchant: "サイゼリヤ",
    description: "",
    categoryId: "food",
    subcategoryId: "food-0",
    paymentMethod: "cash",
    memo: "",
    isFixedCost: false,
    ...overrides,
  };
}
beforeEach(async () => {
  await initializeDb();
  await clearAllData();
});
afterAll(() => db.close());

describe("IndexedDB persistence and atomic mutation", () => {
  it("keeps unfinished financial drafts in IndexedDB and clears them on restore", async () => {
    await db.drafts.put({ id: "expense", value: JSON.stringify({ amount: "680", merchant: "カフェ" }) });
    expect((await db.drafts.get("expense"))?.value).toContain("680");
    const snapshot = await readAppData();
    expect("drafts" in snapshot).toBe(false);
    await restoreAppData(snapshot);
    expect(await db.drafts.count()).toBe(0);
  });
  it("starts without fabricated money and seeds all categories once", async () => {
    await initializeDb();
    const data = await readAppData();
    expect(data.settings.openingLiquidBalance).toBeNull();
    expect(data.categories).toHaveLength(defaultCategories.length);
    expect(data.expenses).toHaveLength(0);
  });
  it("saves the expense and learning together, then edits without duplicating it", async () => {
    await saveExpense(expense());
    expect(await db.expenses.count()).toBe(1);
    expect(await db.merchantRules.get("サイゼリヤ")).toMatchObject({
      categoryId: "food",
      subcategoryId: "food-0",
    });
    await saveExpense(
      expense({
        categoryId: "social",
        subcategoryId: "social-0",
        amount: 1400,
      }),
    );
    expect(await db.expenses.count()).toBe(1);
    expect(await db.merchantRules.get("サイゼリヤ")).toMatchObject({
      categoryId: "social",
      subcategoryId: "social-0",
      usageCount: 2,
    });
    const snapshot = await readAppData();
    expect(validateData(snapshot)).toEqual(snapshot);
  });
  it("fails invalid card references without partially saving learning", async () => {
    await expect(
      saveExpense(
        expense({ paymentMethod: "creditCard", creditCardId: "missing" }),
      ),
    ).rejects.toThrow("カード");
    expect(await db.expenses.count()).toBe(0);
    expect(await db.merchantRules.count()).toBe(0);
  });
  it("confirms a fresh fixed occurrence atomically and prevents a second expense for it", async () => {
    await db.recurringExpenses.add({
      id: "fixed",
      name: "通信",
      amount: 1280,
      categoryId: "fixed",
      subcategoryId: "fixed-0",
      paymentMethod: "bank",
      frequency: "monthly",
      dueDay: 27,
      startDate: "2026-09-01",
      isActive: true,
      note: "",
    });
    const row = expense({
      isFixedCost: true,
      recurringOccurrenceId: "fixed:2026-09",
    });
    await saveExpense(row);
    expect(await db.recurringOccurrences.get("fixed:2026-09")).toMatchObject({
      status: "paid",
      dueDate: "2026-09-27",
      expenseId: row.id,
    });
    await expect(saveExpense({ ...row, id: "second" })).rejects.toThrow(
      "すでに記録",
    );
    expect(await db.expenses.count()).toBe(1);
    expect(
      computeFinance(await readAppData(), "2026-09-24").upcomingFixedCosts,
    ).toBe(0);
    const removed = await deleteExpense(row.id);
    expect(await db.recurringOccurrences.count()).toBe(0);
    expect(
      computeFinance(await readAppData(), "2026-09-24").upcomingFixedCosts,
    ).toBe(1280);
    validateData(await readAppData());
    await saveExpense(removed!); // The same API provides a full Undo.
    expect(await db.recurringOccurrences.count()).toBe(1);
    validateData(await readAppData());
  });
  it("duplicate warnings use normalized merchants and the five-minute window", () => {
    expect(
      findDuplicateExpenses(
        expense({
          id: "new",
          merchant: "株式会社 サイゼリヤ",
          createdAt: "2026-09-24T12:03:00+09:00",
        }),
        [expense()],
      ),
    ).toHaveLength(1);
    expect(
      findDuplicateExpenses(
        expense({ id: "new", createdAt: "2026-09-24T12:06:00+09:00" }),
        [expense()],
      ),
    ).toHaveLength(0);
  });
  it("backup snapshot survives clear and restore with identical accounting", async () => {
    await updateSettings({ openingLiquidBalance: 30000 });
    await saveExpense(expense());
    const snapshot = await readAppData();
    const before = computeFinance(snapshot, "2026-09-24");
    await clearAllData();
    expect((await readAppData()).expenses).toHaveLength(0);
    await restoreAppData(snapshot);
    expect(await readAppData()).toEqual(snapshot);
    expect(computeFinance(await readAppData(), "2026-09-24")).toEqual(before);
  });
  it("rolls back the entire restore if a row fails validation", async () => {
    await updateSettings({ openingLiquidBalance: 30000 });
    await saveExpense(expense());
    const original = await readAppData();
    const invalid = structuredClone(original);
    invalid.expenses.push(expense({ id: "invalid", amount: -20 }));
    await expect(restoreAppData(invalid)).rejects.toThrow();
    expect(await readAppData()).toEqual(original);
  });
  it("database hooks reject negative, zero and fractional actual amounts", async () => {
    for (const amount of [-1, 0, 0.1])
      await expect(db.expenses.add(expense({ amount }))).rejects.toThrow();
    expect(await db.expenses.count()).toBe(0);
  });
  it("allows a deliberate zero monthly budget", async () => {
    await db.budgets.add({
      ...stamped,
      id: "zero",
      year: 2026,
      month: 9,
      totalBudget: 0,
      categoryBudgets: {},
    });
    await updateSettings({ openingLiquidBalance: 30000 });
    expect(computeFinance(await readAppData(), "2026-09-24")).toMatchObject({
      monthlyBudget: 0,
      dailyAllowance: 0,
    });
    validateData(await readAppData());
  });
  it("card-to-cash edits and deletion leave a snapshot that can still be backed up", async () => {
    await db.cards.add({
      ...stamped,
      id: "card",
      name: "Visa",
      last4: "1234",
      closingDay: 15,
      paymentDay: 27,
      paymentMonthOffset: 1,
      openingOutstanding: 0,
      isActive: true,
    });
    await saveExpense(
      expense({ paymentMethod: "creditCard", creditCardId: "card" }),
    );
    await db.cardPayments.add({
      ...stamped,
      id: "payment",
      creditCardId: "card",
      amount: 1280,
      date: "2026-09-24",
      memo: "",
    });
    await saveExpense(expense({ paymentMethod: "cash" }));
    validateData(await readAppData());
    await deleteExpense("expense");
    validateData(await readAppData());
  });
  it("reconciles current money correctly after initial balance was skipped and expenses already exist", async () => {
    await saveExpense(expense());
    expect(
      computeFinance(await readAppData(), "2026-09-24").liquidBalance,
    ).toBeNull();
    await reconcileLiquidBalance(30000, "2026-09-24", "初めて残高を確認");
    const data = await readAppData();
    expect(computeFinance(data, "2026-09-24").liquidBalance).toBe(30000);
    expect(data.balanceAdjustments).toHaveLength(1);
    expect(data.balanceAdjustments[0]).toMatchObject({
      previousBalance: -1280,
      newBalance: 30000,
      difference: 31280,
    });
    await reconcileLiquidBalance(28000, "2026-09-24");
    expect(
      computeFinance(await readAppData(), "2026-09-24").liquidBalance,
    ).toBe(28000);
  });
  it("reconciles a lower real balance after income was entered without initial balance", async () => {
    await db.incomes.add({
      ...stamped,
      id: "salary",
      amount: 50000,
      date: "2026-09-24",
      source: "給与",
      memo: "",
      type: "salary",
    });
    await reconcileLiquidBalance(30000, "2026-09-24");
    expect(
      computeFinance(await readAppData(), "2026-09-24").liquidBalance,
    ).toBe(30000);
    expect((await db.settings.get("main"))?.openingLiquidBalance).toBe(0);
    expect((await db.balanceAdjustments.toArray())[0].difference).toBe(-20000);
  });
});
