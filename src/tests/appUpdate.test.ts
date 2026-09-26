import { afterEach, describe, expect, it, vi } from "vitest";
import { checkServiceWorkerUpdate } from "../domain/appUpdate";

class Worker extends EventTarget {
  state: ServiceWorkerState = "installing";
  change(state: ServiceWorkerState) {
    this.state = state;
    this.dispatchEvent(new Event("statechange"));
  }
}
class Registration extends EventTarget {
  waiting: Worker | null = null;
  installing: Worker | null = null;
  update = vi.fn(async () => {});
  asBrowserRegistration() {
    return this as unknown as ServiceWorkerRegistration;
  }
}
afterEach(() => vi.useRealTimers());

describe("service worker update checks", () => {
  it("uses an already downloaded update without another request or activation", async () => {
    const registration = new Registration();
    registration.waiting = new Worker();
    expect(
      await checkServiceWorkerUpdate(registration.asBrowserRegistration()),
    ).toBe(true);
    expect(registration.update).not.toHaveBeenCalled();
  });
  it("reports current only after a completed check with no installing worker", async () => {
    const registration = new Registration();
    expect(
      await checkServiceWorkerUpdate(registration.asBrowserRegistration()),
    ).toBe(false);
    expect(registration.update).toHaveBeenCalledOnce();
  });
  it("waits for files to install before offering the update", async () => {
    const registration = new Registration();
    const worker = new Worker();
    registration.update.mockImplementation(async () => {
      registration.installing = worker;
      registration.dispatchEvent(new Event("updatefound"));
    });
    const settled = vi.fn();
    const result = checkServiceWorkerUpdate(
      registration.asBrowserRegistration(),
    ).then(settled);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    worker.change("installed");
    await result;
    expect(settled).toHaveBeenCalledWith(true);
  });
  it("does not report success when downloads fail", async () => {
    const registration = new Registration();
    registration.installing = new Worker();
    const result = checkServiceWorkerUpdate(
      registration.asBrowserRegistration(),
    );
    await Promise.resolve();
    const failure = expect(result).rejects.toThrow("準備できません");
    registration.installing.change("redundant");
    await failure;
  });
  it("handles an unreachable server without exposing technical errors", async () => {
    const registration = new Registration();
    registration.update.mockRejectedValue(
      new Error("NetworkError: private implementation details"),
    );
    await expect(
      checkServiceWorkerUpdate(registration.asBrowserRegistration()),
    ).rejects.toThrow("更新を確認できませんでした。");
  });
  it("times out a stalled download and removes its event listeners", async () => {
    vi.useFakeTimers();
    const registration = new Registration();
    registration.installing = new Worker();
    const removed = vi.spyOn(registration.installing, "removeEventListener");
    const result = checkServiceWorkerUpdate(
      registration.asBrowserRegistration(),
      1000,
    );
    const failure = expect(result).rejects.toThrow("時間がかかっています");
    await vi.advanceTimersByTimeAsync(1000);
    await failure;
    expect(removed).toHaveBeenCalledWith("statechange", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });
  it("also times out a request that never resolves", async () => {
    vi.useFakeTimers();
    const registration = new Registration();
    registration.update.mockImplementation(() => new Promise(() => {}));
    const failure = expect(
      checkServiceWorkerUpdate(registration.asBrowserRegistration(), 1000),
    ).rejects.toThrow("時間がかかっています");
    await vi.advanceTimersByTimeAsync(1000);
    await failure;
  });
});
