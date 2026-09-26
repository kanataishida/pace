import { useEffect, useState } from "react";
import { liveQuery } from "dexie";
import type { AppData } from "../types";
import { initializeDb, readAppData } from "../db";

export function useAppData(): { data: AppData | null; error: string | null } {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    void initializeDb()
      .then(() => {
        if (cancelled) return;
        const subscription = liveQuery(readAppData).subscribe({
          next: (value) => {
            setData(value);
            setError(null);
          },
          error: () =>
            setError(
              "端末の保存領域を読み込めませんでした。Safariのプライベートブラウズや空き容量を確認してください。",
            ),
        });
        unsubscribe = () => subscription.unsubscribe();
      })
      .catch(() => {
        if (!cancelled)
          setError(
            "データを保存する準備ができませんでした。端末の空き容量とSafariの設定を確認してください。",
          );
      });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);
  return { data, error };
}
