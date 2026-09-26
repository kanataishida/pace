/** Wait for the actual installation, not just the update request. Never activate it. */
export function checkServiceWorkerUpdate(
  registration: ServiceWorkerRegistration,
  timeoutMs = 15000,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    let worker: ServiceWorker | null = null;
    let finished = false;
    const finish = (available: boolean, error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      registration.removeEventListener("updatefound", observe);
      worker?.removeEventListener("statechange", changed);
      if (error) reject(error);
      else resolve(available);
    };
    const changed = () => {
      if (registration.waiting || worker?.state === "installed") finish(true);
      else if (worker?.state === "redundant")
        finish(false, new Error("更新ファイルを準備できませんでした。"));
      else if (worker?.state === "activated") finish(false);
    };
    const observe = () => {
      worker?.removeEventListener("statechange", changed);
      worker = registration.installing;
      worker?.addEventListener("statechange", changed);
      changed();
    };
    const timer = setTimeout(
      () => finish(false, new Error("更新の確認に時間がかかっています。")),
      timeoutMs,
    );
    registration.addEventListener("updatefound", observe);
    if (registration.waiting) {
      finish(true);
      return;
    }
    void registration
      .update()
      .then(() => {
        if (finished) return;
        observe();
        if (!worker && !registration.waiting) finish(false);
      })
      .catch(() => finish(false, new Error("更新を確認できませんでした。")));
  });
}
