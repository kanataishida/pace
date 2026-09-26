import { createContext, useContext } from "react";
import type { AppData, Expense } from "../types";
import type { computeFinance } from "../domain/finance";
export interface AppContextValue {
  data: AppData;
  finance: ReturnType<typeof computeFinance>;
  today: string;
  openExpense: (expense?: Expense) => void;
  toast: (message: string, undo?: () => Promise<void>) => void;
  run: (action: () => Promise<void>, success?: string) => Promise<void>;
}
export const AppContext = createContext<AppContextValue | null>(null);
export function usePace() {
  const context = useContext(AppContext);
  if (!context) throw new Error("アプリの準備ができていません。");
  return context;
}
