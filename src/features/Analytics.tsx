import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  FileText,
  PieChart as PieIcon,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AppData, Expense } from "../types";
import { APP_NAME } from "../types";
import { dateKey, todayJST } from "../domain/dates";
import "./analytics.css";

interface AnalyticsProps {
  data: AppData;
  onViewHistory: (
    categoryId?: string,
    month?: string,
    from?: string,
    to?: string,
  ) => void;
}
const yen = (amount: number) =>
  new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(amount);
const sum = (items: { amount: number }[]) =>
  items.reduce((total, item) => total + item.amount, 0);
const daysInMonth = (month: string) =>
  new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
  ).getUTCDate();
const dayOf = (month: string, day: number) =>
  `${month}-${String(day).padStart(2, "0")}`;
const shiftMonth = (month: string, delta: number) =>
  new Date(
    Date.UTC(
      Number(month.slice(0, 4)),
      Number(month.slice(5, 7)) - 1 + delta,
      1,
    ),
  )
    .toISOString()
    .slice(0, 7);
const shiftDay = (date: string, delta: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + delta * 86400000)
    .toISOString()
    .slice(0, 10);
const monthLabel = (month: string) =>
  `${Number(month.slice(0, 4))}年${Number(month.slice(5, 7))}月`;
const weekNames = ["日", "月", "火", "水", "木", "金", "土"];
const chartMoney = (amount: number) =>
  Math.abs(amount) >= 10000
    ? `${Math.round(amount / 1000) / 10}万`
    : amount.toLocaleString("ja-JP");

export function Analytics({ data, onViewHistory }: AnalyticsProps) {
  const today = todayJST();
  const currentMonth = today.slice(0, 7);
  const [params] = useSearchParams();
  const queryMonth = params.get("month");
  const initialMonth =
    queryMonth &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(queryMonth) &&
    queryMonth >= "1900-01" &&
    queryMonth <= currentMonth
      ? queryMonth
      : currentMonth;
  const [month, setMonth] = useState(initialMonth);
  const [range, setRange] = useState(1);
  const [report, setReport] = useState(
    params.get("report") === "1" || initialMonth !== currentMonth,
  );
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const rangeStart = dayOf(shiftMonth(month, -(range - 1)), 1);
  const rangeEnd =
    month === currentMonth ? today : dayOf(month, daysInMonth(month));
  const inRange = (date: string) =>
    dateKey(date) >= rangeStart && dateKey(date) <= rangeEnd;
  const periodExpenses = useMemo(
    () =>
      data.expenses.filter(
        (expense) =>
          dateKey(expense.date) >= rangeStart &&
          dateKey(expense.date) <= rangeEnd,
      ),
    [data.expenses, rangeStart, rangeEnd],
  );
  const monthExpenses = useMemo(
    () =>
      data.expenses.filter(
        (expense) =>
          dateKey(expense.date).slice(0, 7) === month &&
          dateKey(expense.date) <= today,
      ),
    [data.expenses, month, today],
  );
  const expenseTotal = sum(periodExpenses);
  const incomeTotal = sum(
    data.incomes.filter((income) => inRange(income.date)),
  );
  const repaymentTotal = sum(
    data.repayments.filter((item) => inRange(item.date)),
  );
  const savingsTotal = sum(
    data.savingsContributions.filter((item) => inRange(item.date)),
  );
  const cardTotal = sum(
    periodExpenses.filter((item) => item.paymentMethod === "creditCard"),
  );
  const categoryData = useMemo(() => {
    const amounts = new Map<string, number>();
    for (const expense of periodExpenses)
      amounts.set(
        expense.categoryId,
        (amounts.get(expense.categoryId) ?? 0) + expense.amount,
      );
    return [...amounts]
      .map(([id, value]) => ({
        id,
        value,
        name:
          data.categories.find((category) => category.id === id)?.name ??
          "未分類",
        color:
          data.categories.find((category) => category.id === id)?.color ??
          "#8494a4",
      }))
      .sort((a, b) => b.value - a.value);
  }, [periodExpenses, data.categories]);
  const activeCategory =
    categoryData.find((category) => category.id === selectedCategory) ??
    categoryData[0];
  const merchantData = useMemo(() => {
    const amounts = new Map<string, { amount: number; count: number }>();
    for (const expense of periodExpenses) {
      const name =
        expense.merchant.trim() || expense.description.trim() || "店名なし";
      const previous = amounts.get(name) ?? { amount: 0, count: 0 };
      amounts.set(name, {
        amount: previous.amount + expense.amount,
        count: previous.count + 1,
      });
    }
    return [...amounts]
      .map(([name, item]) => ({ name, ...item }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [periodExpenses]);
  const monthlySeries = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => {
        const key = shiftMonth(month, index - 11);
        return {
          key,
          name: `${Number(key.slice(5))}月`,
          収入: sum(
            data.incomes.filter(
              (item) =>
                dateKey(item.date).slice(0, 7) === key &&
                dateKey(item.date) <= today,
            ),
          ),
          支出: sum(
            data.expenses.filter(
              (item) =>
                dateKey(item.date).slice(0, 7) === key &&
                dateKey(item.date) <= today,
            ),
          ),
        };
      }),
    [data.incomes, data.expenses, month, today],
  );
  const dailySeries = useMemo(
    () =>
      Array.from({ length: daysInMonth(month) }, (_, index) => {
        const key = dayOf(month, index + 1);
        return {
          date: key,
          name: `${index + 1}`,
          支出:
            key > today
              ? null
              : sum(
                  monthExpenses.filter(
                    (expense) => dateKey(expense.date) === key,
                  ),
                ),
        };
      }),
    [monthExpenses, month, today],
  );
  const previousMonth = shiftMonth(month, -1);
  const comparisonDay =
    month === currentMonth
      ? Math.min(Number(today.slice(8)), daysInMonth(previousMonth))
      : daysInMonth(previousMonth);
  const previousStart = dayOf(previousMonth, 1),
    previousEnd = dayOf(previousMonth, comparisonDay);
  const previousExpenses = data.expenses.filter(
    (expense) =>
      dateKey(expense.date) >= previousStart &&
      dateKey(expense.date) <= previousEnd,
  );
  const trackedDays = useMemo(
    () =>
      new Set([
        ...data.expenses.map((item) => dateKey(item.date)),
        ...data.dailyCheckIns
          .filter((item) => item.noSpendingConfirmed)
          .map((item) => item.date),
      ]),
    [data.expenses, data.dailyCheckIns],
  );
  const hasPreviousData = [...trackedDays].some(
    (day) => day >= previousStart && day <= previousEnd,
  );
  const monthlyDifference = sum(monthExpenses) - sum(previousExpenses);
  const weekdayData = useMemo(() => {
    const last90Start = shiftDay(today, -89);
    const tracked = [...trackedDays].filter(
      (day) => day >= last90Start && day <= today,
    );
    if (tracked.length < 14) return null;
    return Array.from({ length: 7 }, (_, index) => {
      const weekday = (index + 1) % 7;
      const days = tracked.filter(
        (day) => new Date(`${day}T00:00:00Z`).getUTCDay() === weekday,
      );
      const amounts = data.expenses.filter((item) =>
        days.includes(dateKey(item.date)),
      );
      return {
        name: weekNames[weekday],
        平均: days.length ? Math.round(sum(amounts) / days.length) : 0,
        count: days.length,
      };
    });
  }, [trackedDays, data.expenses, today]);
  const weekOffset = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const weekStart = shiftDay(today, -weekOffset),
    lastWeekStart = shiftDay(weekStart, -7),
    lastWeekEnd = shiftDay(today, -7);
  const weeklyExpenses = data.expenses.filter(
    (expense) =>
      dateKey(expense.date) >= weekStart && dateKey(expense.date) <= today,
  );
  const lastWeekExpenses = data.expenses.filter(
    (expense) =>
      dateKey(expense.date) >= lastWeekStart &&
      dateKey(expense.date) <= lastWeekEnd,
  );
  const hasWeeklyComparison = [...trackedDays].some(
    (day) => day >= lastWeekStart && day <= lastWeekEnd,
  );
  const weeklyDifference = sum(weeklyExpenses) - sum(lastWeekExpenses);
  const weekCategory = useMemo(() => {
    const totals = new Map<string, number>();
    for (const item of weeklyExpenses)
      totals.set(
        item.categoryId,
        (totals.get(item.categoryId) ?? 0) + item.amount,
      );
    const top = [...totals].sort((a, b) => b[1] - a[1])[0];
    return top
      ? {
          name:
            data.categories.find((category) => category.id === top[0])?.name ??
            "未分類",
          amount: top[1],
        }
      : null;
  }, [weeklyExpenses, data.categories]);
  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const changeMonth = (delta: number) => {
    setMonth((value) => {
      const next = shiftMonth(value, delta);
      return next >= "1900-01" && next <= currentMonth ? next : value;
    });
    setSelectedCategory(null);
  };
  const biggest = [...periodExpenses]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  return (
    <div className="page analytics-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">YOUR MONEY, IN PERSPECTIVE</p>
          <h1 className="page-title">
            {report ? "月のレポート" : "お金の流れ"}
          </h1>
          <p className="muted">使い方が見えると、次の一日が決めやすい。</p>
        </div>
        <button
          className={`icon-button ${report ? "active" : ""}`}
          aria-label={report ? "分析に戻る" : "月のレポートを開く"}
          aria-pressed={report}
          onClick={() => {
            setReport(!report);
            setRange(1);
          }}
        >
          <FileText size={21} />
        </button>
      </header>
      <div className="analytics-period surface">
        <button
          className="icon-button"
          disabled={month <= "1900-01"}
          onClick={() => changeMonth(-1)}
          aria-label="前の月"
        >
          <ChevronLeft size={20} />
        </button>
        <label className="analytics-month">
          <span className="sr-only">表示月</span>
          <input
            type="month"
            aria-label="表示月"
            value={month}
            max={currentMonth}
            min="1900-01"
            onChange={(event) => {
              if (
                /^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value) &&
                event.target.value >= "1900-01" &&
                event.target.value <= currentMonth
              )
                setMonth(event.target.value);
            }}
          />
        </label>
        <button
          className="icon-button"
          disabled={month >= currentMonth}
          onClick={() => changeMonth(1)}
          aria-label="次の月"
        >
          <ChevronRight size={20} />
        </button>
      </div>
      {!report && (
        <div className="segmented analytics-ranges" aria-label="集計期間">
          {[1, 3, 6, 12].map((value) => (
            <button
              key={value}
              aria-pressed={range === value}
              className={range === value ? "active" : ""}
              onClick={() => {
                setRange(value);
                setSelectedCategory(null);
              }}
            >
              {value === 1 ? "月" : value === 12 ? "1年" : `${value}か月`}
            </button>
          ))}
        </div>
      )}
      {range > 1 && (
        <p className="muted analytics-range-label">
          {monthLabel(rangeStart.slice(0, 7))}〜{monthLabel(month)}の実績
        </p>
      )}
      {report && (
        <div className="analytics-report-heading">
          <p className="eyebrow">MONTHLY REFLECTION</p>
          <h2>
            {Number(month.slice(5))}月の{APP_NAME}
          </h2>
          <p>
            {month === currentMonth
              ? `${Number(today.slice(8))}日までの記録`
              : "ひと月のお金を、ひと目で。"}
          </p>
        </div>
      )}
      <section className="surface analytics-summary" aria-label="期間の概要">
        <div className="analytics-main-total">
          <span className="muted">
            {range === 1 ? "この月の生活支出" : "期間の生活支出"}
          </span>
          <strong>{yen(expenseTotal)}</strong>
          <span className="analytics-record-count">
            {periodExpenses.length}件の記録
          </span>
        </div>
        <div className="analytics-summary-grid">
          <div>
            <span>
              <ArrowDownLeft size={15} />
              収入
            </span>
            <strong>{yen(incomeTotal)}</strong>
          </div>
          <div>
            <span>
              <Wallet size={15} />
              生活収支
            </span>
            <strong
              className={
                incomeTotal - expenseTotal < 0 ? "analytics-negative" : ""
              }
            >
              {yen(incomeTotal - expenseTotal)}
            </strong>
          </div>
        </div>
        {range === 1 && (
          <p className="analytics-comparison">
            {hasPreviousData
              ? `${month === currentMonth ? "先月同日まで" : "先月"}の記録より ${yen(Math.abs(monthlyDifference))}${monthlyDifference > 0 ? "多い" : monthlyDifference < 0 ? "少ない" : "・同じ金額"}`
              : "前月の記録が増えると、同じ期間で比較できます。"}
          </p>
        )}
        <p className="muted analytics-footnote">
          購入日で集計。カード引落は二重計上せず、返済・貯金の移動は分けています。
        </p>
      </section>

      <section
        className="surface analytics-section"
        aria-labelledby="category-title"
      >
        <div className="section-heading">
          <h2 id="category-title">何に使った？</h2>
          <span className="muted">カテゴリー</span>
        </div>
        {categoryData.length ? (
          <>
            <div className="analytics-donut">
              <ResponsiveContainer width="100%" height={238} minWidth={0}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={77}
                    outerRadius={104}
                    paddingAngle={categoryData.length > 1 ? 3 : 0}
                    stroke="none"
                    isAnimationActive={!reducedMotion}
                    animationDuration={350}
                    onClick={(_, index) =>
                      setSelectedCategory(categoryData[index].id)
                    }
                  >
                    {categoryData.map((category) => (
                      <Cell
                        key={category.id}
                        fill={category.color}
                        opacity={activeCategory?.id === category.id ? 1 : 0.55}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="analytics-donut-center" aria-live="polite">
                <span>{activeCategory?.name}</span>
                <strong>{yen(activeCategory?.value ?? 0)}</strong>
                <span>
                  {expenseTotal
                    ? Math.round(
                        ((activeCategory?.value ?? 0) / expenseTotal) * 100,
                      )
                    : 0}
                  %
                </span>
              </div>
            </div>
            <div className="analytics-category-list">
              {categoryData.map((category) => (
                <button
                  className={`analytics-category ${activeCategory?.id === category.id ? "selected" : ""}`}
                  key={category.id}
                  aria-pressed={activeCategory?.id === category.id}
                  onClick={() => setSelectedCategory(category.id)}
                >
                  <i style={{ background: category.color }} />
                  <span>{category.name}</span>
                  <strong>{yen(category.value)}</strong>
                  <small>
                    {Math.round((category.value / expenseTotal) * 100)}%
                  </small>
                </button>
              ))}
            </div>
            <button
              className="button button-secondary analytics-full-width"
              onClick={() =>
                onViewHistory(
                  activeCategory?.id,
                  range === 1 ? month : undefined,
                  rangeStart,
                  rangeEnd,
                )
              }
            >
              {activeCategory?.name}の履歴を見る
              <ArrowUpRight size={17} />
            </button>
          </>
        ) : (
          <div className="empty-state">
            <PieIcon size={30} />
            <h3>まだ、この期間の支出はありません</h3>
            <p>使った金額を記録すると、ここに内訳が表示されます。</p>
          </div>
        )}
      </section>

      {report && (
        <section className="surface analytics-section">
          <div className="section-heading">
            <h2>今月の内訳</h2>
            <span className="muted">実績</span>
          </div>
          <dl className="analytics-report-lines">
            <div>
              <dt>最大カテゴリー</dt>
              <dd>
                {categoryData[0]
                  ? `${categoryData[0].name} ${yen(categoryData[0].value)}`
                  : "まだ記録がありません"}
              </dd>
            </div>
            <div>
              <dt>カード利用</dt>
              <dd>{yen(cardTotal)}</dd>
            </div>
            <div>
              <dt>借金返済</dt>
              <dd>{yen(repaymentTotal)}</dd>
            </div>
            <div>
              <dt>貯金への移動</dt>
              <dd>{yen(savingsTotal)}</dd>
            </div>
          </dl>
          <p className="muted analytics-footnote">
            カード利用は生活支出の内数です。生活収支には借金返済・貯金への移動を含めていません。
          </p>
        </section>
      )}

      <section className="surface analytics-section">
        <div className="section-heading">
          <h2>月ごとの流れ</h2>
          <span className="muted">過去12か月</span>
        </div>
        <div className="analytics-chart-key">
          <span>
            <i style={{ background: "var(--mint, #75ae9e)" }} />
            収入
          </span>
          <span>
            <i style={{ background: "var(--accent, #285e70)" }} />
            生活支出
          </span>
        </div>
        <div
          className="analytics-chart"
          role="img"
          aria-label={`過去12か月の収入・支出のグラフ。${monthLabel(month)}の収入${yen(monthlySeries[11].収入)}、支出${yen(monthlySeries[11].支出)}`}
        >
          <ResponsiveContainer width="100%" height={224} minWidth={0}>
            <BarChart
              data={monthlySeries}
              margin={{ top: 15, right: 0, left: -18, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 6"
                vertical={false}
                stroke="var(--chart-grid, #dce3ec)"
              />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: "var(--muted, #687688)" }}
                interval={1}
              />
              <YAxis
                tickFormatter={chartMoney}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: "var(--muted, #687688)" }}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 14,
                  background: "var(--surface, #fff)",
                  borderColor: "var(--border, #e4e8ee)",
                  color: "var(--text, #172b3b)",
                }}
                formatter={(value) => yen(Number(value))}
                labelFormatter={(_, payload) =>
                  payload[0]?.payload?.key
                    ? monthLabel(String(payload[0].payload.key))
                    : ""
                }
              />
              <Bar
                dataKey="収入"
                fill="var(--mint, #75ae9e)"
                radius={[3, 3, 0, 0]}
                isAnimationActive={!reducedMotion}
                animationDuration={350}
              />
              <Bar
                dataKey="支出"
                fill="var(--accent, #285e70)"
                radius={[3, 3, 0, 0]}
                isAnimationActive={!reducedMotion}
                animationDuration={350}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <details className="analytics-chart-details">
          <summary>月別の金額を読む</summary>
          <div className="analytics-month-list">
            {monthlySeries.map((item) => (
              <div key={item.key}>
                <span>{monthLabel(item.key)}</span>
                <span>収入 {yen(item.収入)}</span>
                <span>支出 {yen(item.支出)}</span>
              </div>
            ))}
          </div>
        </details>
      </section>

      <section className="surface analytics-section">
        <div className="section-heading">
          <h2>毎日の記録</h2>
          <span className="muted">{Number(month.slice(5))}月</span>
        </div>
        <div className="analytics-chart" aria-label="日別の生活支出グラフ">
          <ResponsiveContainer width="100%" height={154} minWidth={0}>
            <AreaChart
              data={dailySeries}
              margin={{ top: 10, right: 6, left: -18, bottom: 0 }}
            >
              <defs>
                <linearGradient
                  id="pace-daily-gradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor="var(--accent, #285e70)"
                    stopOpacity={0.28}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--accent, #285e70)"
                    stopOpacity={0.01}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 6"
                vertical={false}
                stroke="var(--chart-grid, #dce3ec)"
              />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                minTickGap={20}
                tick={{ fontSize: 12, fill: "var(--muted, #687688)" }}
              />
              <YAxis
                tickFormatter={chartMoney}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: "var(--muted, #687688)" }}
              />
              <Tooltip
                formatter={(value) => yen(Number(value))}
                labelFormatter={(label) =>
                  `${Number(month.slice(5))}月${label}日`
                }
                contentStyle={{
                  borderRadius: 14,
                  background: "var(--surface, #fff)",
                  borderColor: "var(--border, #e4e8ee)",
                }}
              />
              <Area
                type="monotone"
                dataKey="支出"
                stroke="var(--accent, #285e70)"
                strokeWidth={2}
                fill="url(#pace-daily-gradient)"
                isAnimationActive={!reducedMotion}
                animationDuration={350}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div
          className="analytics-calendar"
          aria-label={`${monthLabel(month)}の支出カレンダー`}
        >
          {weekNames.map((day) => (
            <span className="analytics-weekday" key={day}>
              {day}
            </span>
          ))}
          {Array.from(
            { length: new Date(`${month}-01T00:00:00Z`).getUTCDay() },
            (_, index) => (
              <span key={`blank-${index}`} />
            ),
          )}
          {dailySeries.map((day) => {
            const max = Math.max(
              ...dailySeries.map((item) => item.支出 ?? 0),
              1,
            );
            const alpha = day.支出 ? 0.08 + (day.支出 / max) * 0.2 : 0;
            return (
              <div
                className={`analytics-calendar-day ${day.date === today ? "is-today" : ""} ${day.date > today ? "is-future" : ""}`}
                key={day.date}
                style={{
                  backgroundColor: alpha
                    ? `rgba(40, 94, 112, ${alpha})`
                    : undefined,
                }}
                aria-label={`${day.name}日 ${day.支出 === null ? "未来" : `${yen(day.支出)}${day.支出 === 0 && !trackedDays.has(day.date) ? "、記録未確認" : ""}`}`}
              >
                <span>{day.name}</span>
                <strong>
                  {day.支出 === null
                    ? "—"
                    : day.支出 >= 10000
                      ? `${Math.round(day.支出 / 1000) / 10}万`
                      : yen(day.支出)}
                </strong>
                {trackedDays.has(day.date) && day.支出 === 0 && (
                  <i aria-label="支出なし確認済み" />
                )}
              </div>
            );
          })}
        </div>
        <p className="muted analytics-footnote">
          ¥0は支出の記録なし。小さな点は「今日は使っていない」を確認した日です。
        </p>
      </section>

      <div className="analytics-two-column">
        <section className="surface analytics-section">
          <div className="section-heading">
            <h2>よく使ったお店</h2>
            <span className="muted">TOP 5</span>
          </div>
          {merchantData.length ? (
            <ol className="analytics-ranking">
              {merchantData.map((item, index) => (
                <li key={item.name}>
                  <span className="analytics-rank">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <strong>{item.name}</strong>
                    <small>{item.count}回の記録</small>
                  </div>
                  <b>{yen(item.amount)}</b>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">店名を記録すると、使い方が見えてきます。</p>
          )}
        </section>
        <section className="surface analytics-section">
          <div className="section-heading">
            <h2>大きな支出</h2>
            <span className="muted">TOP 5</span>
          </div>
          {biggest.length ? (
            <ol className="analytics-ranking">
              {biggest.map((item: Expense, index) => (
                <li key={item.id}>
                  <span className="analytics-rank">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <strong>
                      {item.merchant || item.description || "店名なし"}
                    </strong>
                    <small>{dateKey(item.date).replaceAll("-", "/")}</small>
                  </div>
                  <b>{yen(item.amount)}</b>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">記録が増えると、金額順に振り返れます。</p>
          )}
        </section>
      </div>

      {!report && (
        <section className="surface analytics-section analytics-week-summary">
          <p className="eyebrow">THIS WEEK</p>
          <h2>今週、ここまで</h2>
          <p className="muted">
            {weekStart.slice(5).replace("-", "/")}〜
            {today.slice(5).replace("-", "/")}
          </p>
          <strong className="analytics-week-amount">
            {yen(sum(weeklyExpenses))}
          </strong>
          <p>
            {hasWeeklyComparison
              ? `先週の同じ曜日までの記録より ${yen(Math.abs(weeklyDifference))}${weeklyDifference > 0 ? "多い" : weeklyDifference < 0 ? "少ない" : "・同じ金額"}`
              : "先週の記録が増えると、同じ曜日までで比較できます。"}
          </p>
          {weekCategory && (
            <div className="analytics-week-top">
              <span>最大カテゴリー</span>
              <strong>
                {weekCategory.name} · {yen(weekCategory.amount)}
              </strong>
            </div>
          )}
        </section>
      )}
      {!report && (
        <section className="surface analytics-section">
          <div className="section-heading">
            <h2>曜日ごとのリズム</h2>
            <span className="muted">直近90日</span>
          </div>
          {weekdayData ? (
            <>
              <div className="analytics-chart">
                <ResponsiveContainer width="100%" height={180} minWidth={0}>
                  <BarChart
                    data={weekdayData}
                    margin={{ top: 10, right: 0, left: -18, bottom: 0 }}
                  >
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: "var(--muted, #687688)" }}
                    />
                    <YAxis
                      tickFormatter={chartMoney}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: "var(--muted, #687688)" }}
                    />
                    <Tooltip
                      formatter={(value) => yen(Number(value))}
                      contentStyle={{
                        borderRadius: 14,
                        background: "var(--surface, #fff)",
                        borderColor: "var(--border, #e4e8ee)",
                      }}
                    />
                    <Bar
                      dataKey="平均"
                      fill="var(--accent, #285e70)"
                      radius={[5, 5, 0, 0]}
                      isAnimationActive={!reducedMotion}
                      animationDuration={350}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="muted analytics-footnote">
                支出を記録した日と「使っていない」を確認した日の平均です。未記録の日は含みません。
              </p>
              <details className="analytics-chart-details">
                <summary>曜日別の金額を読む</summary>
                {weekdayData.map((day) => (
                  <p key={day.name}>
                    {day.name}曜日：{yen(day.平均)}（{day.count}日）
                  </p>
                ))}
              </details>
            </>
          ) : (
            <div className="analytics-insight-empty">
              <span className="analytics-mini-bars" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
              </span>
              <h3>記録が増えると、リズムが見えてきます</h3>
              <p className="muted">
                直近90日で14日分の記録がたまると、曜日別の平均支出を表示します。使わなかった日の確認も含まれます。
              </p>
            </div>
          )}
        </section>
      )}
      {!report && (
        <section className="surface analytics-section">
          <div className="section-heading">
            <h2>未来への移動</h2>
            <span className="muted">この期間の実績</span>
          </div>
          <div className="analytics-summary-grid">
            <div>
              <span>借金返済</span>
              <strong>{yen(repaymentTotal)}</strong>
            </div>
            <div>
              <span>貯金への移動</span>
              <strong>{yen(savingsTotal)}</strong>
            </div>
          </div>
          <p className="muted analytics-footnote">
            生活支出と分けて振り返れます。
          </p>
        </section>
      )}
    </div>
  );
}
export default Analytics;
