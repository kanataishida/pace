import type {
  AppData,
  CreditCard,
  Debt,
  DebtRepayment,
  RecurringExpense,
  SavingsContribution,
  SavingsGoal,
} from "../types";
import {
  addMonthsDate,
  dateKey,
  dateOnDay,
  daysInMonth,
  monthEnd,
  monthKey,
  remainingDaysIncludingToday,
  todayJST,
} from "./dates";

export const MAX_MONEY = 999_999_999_999;
export function assertMoney(value: number, allowZero = false): void {
  if (
    !Number.isSafeInteger(value) ||
    value < (allowZero ? 0 : 1) ||
    value > MAX_MONEY
  )
    throw new Error(
      allowZero
        ? "金額は0円以上の整数で入力してください。"
        : "金額は1円以上の整数で入力してください。",
    );
}
function sum(values: number[]): number {
  return values.reduce((total, value) => {
    const result = total + value;
    if (!Number.isSafeInteger(result))
      throw new Error("合計金額が計算できる範囲を超えています。");
    return result;
  }, 0);
}
function happened(value: string, today: string): boolean {
  return dateKey(value) <= dateKey(today);
}
function inMonth(value: string, today: string): boolean {
  return monthKey(value) === monthKey(today) && happened(value, today);
}

export function calculateLiquidBalance(
  data: AppData,
  today = todayJST(),
): number | null {
  if (data.settings.openingLiquidBalance === null) return null;
  return sum([
    data.settings.openingLiquidBalance,
    ...data.incomes
      .filter((row) => happened(row.date, today))
      .map((row) => row.amount),
    ...data.debts
      .filter((row) => row.cashReceived && happened(row.startedAt, today))
      .map((row) => row.openingBalance),
    ...data.expenses
      .filter(
        (row) =>
          row.paymentMethod !== "creditCard" && happened(row.date, today),
      )
      .map((row) => -row.amount),
    ...data.cardPayments
      .filter((row) => happened(row.date, today))
      .map((row) => -row.amount),
    ...data.repayments
      .filter((row) => happened(row.date, today))
      .map((row) => -row.amount),
    ...data.savingsContributions
      .filter((row) => happened(row.date, today))
      .map((row) => -row.amount),
    ...data.balanceAdjustments
      .filter((row) => happened(row.date, today))
      .map((row) => row.difference),
  ]);
}

/** Signed per-card ledger. A negative number is a card credit, not liquid cash. */
export function calculateCardLedger(
  data: AppData,
  cardId: string,
  today = todayJST(),
): number {
  const card = data.cards.find((row) => row.id === cardId);
  return sum([
    card?.openingOutstanding ?? 0,
    ...data.expenses
      .filter(
        (row) =>
          row.creditCardId === cardId &&
          row.paymentMethod === "creditCard" &&
          happened(row.date, today),
      )
      .map((row) => row.amount),
    ...data.cardPayments
      .filter((row) => row.creditCardId === cardId && happened(row.date, today))
      .map((row) => -row.amount),
  ]);
}
export function calculateCardOutstanding(
  data: AppData,
  cardId?: string,
  today = todayJST(),
): number {
  if (cardId) return Math.max(0, calculateCardLedger(data, cardId, today));
  // Inactive cards still have a liability. Never silently erase it by hiding a card.
  return sum(
    data.cards.map((card) =>
      Math.max(0, calculateCardLedger(data, card.id, today)),
    ),
  );
}
export function calculateDebtBalance(
  debt: Debt,
  repayments: DebtRepayment[],
  today = todayJST(),
): number {
  if (!happened(debt.startedAt, today)) return 0;
  return Math.max(
    0,
    debt.openingBalance -
      sum(
        repayments
          .filter((row) => row.debtId === debt.id && happened(row.date, today))
          .map((row) => row.amount),
      ),
  );
}
/** Monthly plan for dated upcoming displays; overdue current-month payments remain visible. */
export function nextDebtPayment(
  data: AppData,
  debt: Debt,
  today = todayJST(),
): { date: string; amount: number } | null {
  if (!debt.nextPaymentDate || debt.plannedMonthlyPayment <= 0) return null;
  const balance = calculateDebtBalance(debt, data.repayments, today);
  if (balance <= 0) return null;
  const earliest = dateKey(debt.nextPaymentDate);
  const day = Number(earliest.slice(8, 10));
  // An explicit later first date must never be pulled back into the present month.
  if (earliest > monthEnd(today))
    return {
      date: earliest,
      amount: Math.min(balance, debt.plannedMonthlyPayment),
    };
  const paidThisMonth = sum(
    data.repayments
      .filter((row) => row.debtId === debt.id && inMonth(row.date, today))
      .map((row) => row.amount),
  );
  const remaining = Math.max(0, debt.plannedMonthlyPayment - paidThisMonth);
  let dueDate = dateOnDay(monthKey(today), day);
  if (remaining === 0 || dueDate < dateKey(debt.startedAt)) {
    // Calculate from the configured day again: February 28 must not turn March 31 into March 28.
    dueDate = dateOnDay(
      monthKey(addMonthsDate(`${monthKey(today)}-01`, 1)),
      day,
    );
    return {
      date: dueDate,
      amount: Math.min(balance, debt.plannedMonthlyPayment),
    };
  }
  return {
    date: dueDate < earliest ? earliest : dueDate,
    amount: Math.min(balance, remaining),
  };
}
export function calculateSavingsAmount(
  goal: SavingsGoal,
  contributions: SavingsContribution[],
  today = todayJST(),
): number {
  return sum([
    goal.openingAmount,
    ...contributions
      .filter(
        (row) => row.savingsGoalId === goal.id && happened(row.date, today),
      )
      .map((row) => row.amount),
  ]);
}
export function calculateDebtPaymentReserve(
  data: AppData,
  today = todayJST(),
): number {
  return sum(
    data.debts
      .filter((debt) => happened(debt.startedAt, today))
      .map((debt) => {
        if (
          debt.nextPaymentDate &&
          dateKey(debt.nextPaymentDate) > monthEnd(today)
        )
          return 0;
        const repaid = sum(
          data.repayments
            .filter((row) => row.debtId === debt.id && inMonth(row.date, today))
            .map((row) => row.amount),
        );
        return Math.min(
          calculateDebtBalance(debt, data.repayments, today),
          Math.max(0, debt.plannedMonthlyPayment - repaid),
        );
      }),
  );
}
export function calculateSavingsReserve(
  data: AppData,
  today = todayJST(),
): number {
  return sum(
    data.savingsGoals
      .filter((goal) => happened(goal.createdAt, today))
      .map((goal) => {
        const saved = sum(
          data.savingsContributions
            .filter(
              (row) =>
                row.savingsGoalId === goal.id && inMonth(row.date, today),
            )
            .map((row) => row.amount),
        );
        const remainingTarget = Math.max(
          0,
          goal.targetAmount -
            calculateSavingsAmount(goal, data.savingsContributions, today),
        );
        return Math.min(
          remainingTarget,
          Math.max(0, goal.monthlyTarget - saved),
        );
      }),
  );
}
export interface RecurringDue {
  id: string;
  recurringExpenseId: string;
  dueDate: string;
  amount: number;
  name: string;
  recurringExpense: RecurringExpense;
}
export function getRecurringDue(
  data: AppData,
  today = todayJST(),
): RecurringDue[] {
  const end = monthEnd(today);
  const occurrenceMap = new Map(
    data.recurringOccurrences.map((row) => [row.id, row]),
  );
  const expensesByOccurrence = new Map(
    data.expenses
      .filter((row) => row.recurringOccurrenceId && happened(row.date, today))
      .map((row) => [row.recurringOccurrenceId, row]),
  );
  const result: RecurringDue[] = [];
  for (const recurring of data.recurringExpenses) {
    if (!recurring.isActive || dateKey(recurring.startDate) > end) continue;
    let month = monthKey(recurring.startDate);
    while (`${month}-01` <= end) {
      const dueDate = dateOnDay(month, recurring.dueDay);
      if (
        dueDate >= dateKey(recurring.startDate) &&
        (!recurring.endDate || dueDate <= dateKey(recurring.endDate))
      ) {
        const id = `${recurring.id}:${month}`;
        const occurrence = occurrenceMap.get(id);
        // A paid marker alone cannot remove a reserve after its expense was deleted.
        const resolved =
          occurrence?.status === "skipped" || expensesByOccurrence.has(id);
        if (!resolved)
          result.push({
            id,
            recurringExpenseId: recurring.id,
            dueDate,
            amount: recurring.amount,
            name: recurring.name,
            recurringExpense: recurring,
          });
      }
      month = monthKey(
        addMonthsDate(`${month}-01`, recurring.frequency === "yearly" ? 12 : 1),
      );
    }
  }
  return result.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
export function calculateUpcomingFixedCosts(
  data: AppData,
  today = todayJST(),
): number {
  return sum(getRecurringDue(data, today).map((row) => row.amount));
}

export interface SafeToSpendInputs {
  liquidBalance: number | null;
  cardOutstanding: number;
  upcomingFixedCosts: number;
  debtReserve: number;
  savingsReserve: number;
}
export function calculateSafeToSpend(values: SafeToSpendInputs): number | null {
  if (values.liquidBalance === null) return null;
  return sum([
    values.liquidBalance,
    -values.cardOutstanding,
    -values.upcomingFixedCosts,
    -values.debtReserve,
    -values.savingsReserve,
  ]);
}
export function calculateDailyAllowance(
  safeToSpend: number | null,
  monthlyBudgetRemaining: number | null,
  today = todayJST(),
): number | null {
  if (safeToSpend === null) return null;
  const available =
    monthlyBudgetRemaining === null
      ? safeToSpend
      : Math.min(safeToSpend, monthlyBudgetRemaining);
  return Math.round(
    Math.max(0, available) / remainingDaysIncludingToday(today),
  );
}
export function calculateBudgetPace(
  monthlyExpense: number,
  monthlyBudget: number | null,
  today = todayJST(),
) {
  const timeProgress = Number(dateKey(today).slice(8, 10)) / daysInMonth(today);
  const budgetProgress =
    monthlyBudget === null
      ? null
      : monthlyBudget === 0
        ? monthlyExpense === 0
          ? 0
          : Infinity
        : monthlyExpense / monthlyBudget;
  const ratio = budgetProgress === null ? null : budgetProgress / timeProgress;
  const label =
    ratio === null
      ? "予算を設定できます"
      : ratio <= 1
        ? "予定ペース"
        : ratio < 1.25
          ? "少し早め"
          : "ペース注意";
  return { label, ratio, budgetProgress, timeProgress };
}
export function computeFinance(data: AppData, today = todayJST()) {
  const liquidBalance = calculateLiquidBalance(data, today);
  const cardOutstanding = calculateCardOutstanding(data, undefined, today);
  const recurringDue = getRecurringDue(data, today);
  const upcomingFixedCosts = sum(recurringDue.map((row) => row.amount));
  const debtReserve = calculateDebtPaymentReserve(data, today);
  const savingsReserve = calculateSavingsReserve(data, today);
  const safeToSpend = calculateSafeToSpend({
    liquidBalance,
    cardOutstanding,
    upcomingFixedCosts,
    debtReserve,
    savingsReserve,
  });
  const monthlyExpenseTotal = sum(
    data.expenses
      .filter((row) => inMonth(row.date, today))
      .map((row) => row.amount),
  );
  const monthlyIncomeTotal = sum(
    data.incomes
      .filter((row) => inMonth(row.date, today))
      .map((row) => row.amount),
  );
  const [year, month] = monthKey(today).split("-").map(Number);
  const monthlyBudget =
    data.budgets.find((row) => row.year === year && row.month === month)
      ?.totalBudget ?? null;
  const monthlyBudgetRemaining =
    monthlyBudget === null ? null : monthlyBudget - monthlyExpenseTotal;
  const dailyAllowance = calculateDailyAllowance(
    safeToSpend,
    monthlyBudgetRemaining,
    today,
  );
  const todaySpent = sum(
    data.expenses
      .filter((row) => dateKey(row.date) === dateKey(today))
      .map((row) => row.amount),
  );
  return {
    liquidBalance,
    cardOutstanding,
    upcomingFixedCosts,
    debtReserve,
    savingsReserve,
    safeToSpend,
    monthlyExpenseTotal,
    monthlyIncomeTotal,
    monthlyBudget,
    monthlyBudgetRemaining,
    dailyAllowance,
    todaySpent,
    todayRemaining:
      dailyAllowance === null ? null : Math.max(0, dailyAllowance - todaySpent),
    pace: calculateBudgetPace(monthlyExpenseTotal, monthlyBudget, today),
    recurringDue,
  };
}

/** Statement allocation is an estimate: users confirm the actual debit amount. */
export function getCardSummary(
  data: AppData,
  card: CreditCard,
  today = todayJST(),
) {
  let nextPaymentDate = dateOnDay(monthKey(today), card.paymentDay);
  if (nextPaymentDate < dateKey(today))
    nextPaymentDate = dateOnDay(
      monthKey(addMonthsDate(today, 1)),
      card.paymentDay,
    );
  const outstanding = calculateCardOutstanding(data, card.id, today);
  const monthlyUsage = sum(
    data.expenses
      .filter(
        (row) =>
          row.creditCardId === card.id &&
          row.paymentMethod === "creditCard" &&
          inMonth(row.date, today),
      )
      .map((row) => row.amount),
  );
  const amountsByDueDate = new Map<string, number>();
  for (const expense of data.expenses.filter(
    (row) =>
      row.creditCardId === card.id &&
      row.paymentMethod === "creditCard" &&
      happened(row.date, today),
  )) {
    const bought = dateKey(expense.date);
    const closing = dateOnDay(monthKey(bought), card.closingDay);
    const dueMonth = monthKey(
      addMonthsDate(
        `${monthKey(bought)}-01`,
        card.paymentMonthOffset + (bought > closing ? 1 : 0),
      ),
    );
    const due = dateOnDay(dueMonth, card.paymentDay);
    amountsByDueDate.set(
      due,
      (amountsByDueDate.get(due) ?? 0) + expense.amount,
    );
  }
  const dueByNext = sum([
    card.openingOutstanding,
    ...[...amountsByDueDate]
      .filter(([due]) => due <= nextPaymentDate)
      .map(([, amount]) => amount),
  ]);
  const paid = sum(
    data.cardPayments
      .filter(
        (row) => row.creditCardId === card.id && happened(row.date, today),
      )
      .map((row) => row.amount),
  );
  const estimatedNextPaymentAmount = Math.min(
    outstanding,
    Math.max(0, dueByNext - paid),
  );
  return {
    outstanding,
    monthlyUsage,
    nextPaymentDate,
    estimatedNextPaymentAmount,
    creditBalance: Math.max(0, -calculateCardLedger(data, card.id, today)),
    isEstimate: true as const,
  };
}
