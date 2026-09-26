import { useEffect, useState } from "react";
import { Fingerprint, LockKeyhole, ShieldCheck } from "lucide-react";
import { AsyncForm, Field, textValue } from "../components/UI";
import {
  disableLock,
  getLockConfig,
  checkDeviceAuthSupport,
  deviceAuthSupportText,
  registerDeviceAuth,
  setPin,
  verifyDeviceAuth,
  verifyPin,
} from "../domain/security";
import type { DeviceAuthSupport } from "../domain/security";
import { usePace } from "../app/context";
import { updateSettings } from "../db";
import { APP_NAME } from "../types";

export function LockScreen({
  onUnlocked,
  error: configError,
}: {
  onUnlocked: () => void;
  error?: string;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  let kind = "none";
  try {
    kind = getLockConfig().kind;
  } catch {
    /* configError is shown without access */
  }
  return (
    <div className="lock-screen">
      <img
        className="lock-logo"
        src={`${import.meta.env.BASE_URL}icon.svg`}
        alt=""
      />
      <h1>{APP_NAME}</h1>
      <p>あなたのお金を、あなたの手元に。</p>
      <div className="lock-panel">
        <LockKeyhole size={27} />
        <h2>ロックを解除</h2>
        {configError ? (
          <p className="form-error">{configError}</p>
        ) : kind === "device" ? (
          <>
            <button
              className="button button-primary full"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setError("");
                void verifyDeviceAuth()
                  .then((ok) => {
                    if (ok) onUnlocked();
                    else
                      setError(
                        "認証を完了できませんでした。もう一度お試しください。",
                      );
                  })
                  .catch((e: unknown) =>
                    setError(
                      e instanceof Error ? e.message : "認証できませんでした。",
                    ),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              <Fingerprint size={22} />
              {busy ? "確認しています…" : "デバイスで認証"}
            </button>
            <p className="hint">
              指紋・顔認証・端末の画面ロックなど、端末で利用できる方法で確認します。
            </p>
          </>
        ) : (
          <AsyncForm
            label="ロックを解除"
            onSubmit={async (f) => {
              if (await verifyPin(textValue(f, "pin"))) onUnlocked();
              else
                throw new Error("PINが一致しません。もう一度ご確認ください。");
            }}
          >
            <Field label="6桁のPIN">
              <input
                name="pin"
                aria-label="6桁のPIN"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                className="pin-input"
              />
            </Field>
          </AsyncForm>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <details>
          <summary>認証できないとき</summary>
          <p className="hint">
            設定したPINまたは端末の認証で解除します。PINを忘れた場合は、保存済みバックアップを別の端末で復元してください。ブラウザデータを消すと、この端末の家計データも消えます。
          </p>
          {kind === "device" && (
            <p className="hint">
              Galaxyでは端末設定に指紋が登録されていることを確認してください。認証画面で端末の画面ロックが提示された場合は、それも利用できます。設定したときと同じブラウザ・URLで開いてください。
            </p>
          )}
        </details>
      </div>
      <small>
        <ShieldCheck size={14} />
        家計データはこの端末内に保存されます
      </small>
    </div>
  );
}

export function SecuritySettings() {
  const { data, run, toast } = usePace();
  const [support, setSupport] = useState<DeviceAuthSupport | null>(null);
  const [checkRevision, setCheckRevision] = useState(0);
  const [kind, setKind] = useState(() => getLockConfig().kind);
  const [choice, setChoice] = useState<"pin" | "device" | "none" | null>(null);
  useEffect(() => {
    let active = true;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      const result = await checkDeviceAuthSupport();
      if (active) setSupport(result);
      pending = false;
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    void refresh();
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [checkRevision]);
  const notify = () => {
    setKind(getLockConfig().kind);
    setChoice(null);
    window.dispatchEvent(new Event("pace-lock-changed"));
    toast("ロック設定を保存しました");
  };
  return (
    <div className="security-settings">
      <div className="note-panel">
        <ShieldCheck size={22} />
        <span>
          現在：
          {kind === "none"
            ? "ロックなし"
            : kind === "pin"
              ? "6桁PIN"
              : "デバイス認証"}
        </span>
      </div>
      <div className="device-auth-guide">
        <strong>
          <Fingerprint size={18} /> 指紋・顔認証などに対応
        </strong>
        <p className="hint">
          Galaxyの指紋認証、iPhoneのFace ID・Touch
          IDなどを利用できます。実際の方法は端末とブラウザによって異なり、端末の画面ロックで確認する場合もあります。
        </p>
        <details>
          <summary>Galaxyで指紋認証を使う準備</summary>
          <ol>
            <li>
              Galaxyの設定で「指紋」を検索し、画面ロックと指紋を登録します。
            </li>
            <li>
              Chromeまたは対応するSamsung
              Internetで、このアプリのHTTPSの公開URLを開きます。
            </li>
            <li>
              下の「デバイス認証」を選んで設定し、端末に表示される案内に従います。
            </li>
          </ol>
          <p className="hint">
            指紋の画像や生体情報をアプリが取得・保存することはありません。認証の保存先はOSの設定に従います。ブラウザを切り替えると家計データの保存領域も変わるため、普段使うブラウザで設定してください。
          </p>
        </details>
      </div>
      <div className="security-options">
        <button
          className={`button ${choice === "device" ? "button-primary" : "button-secondary"}`}
          disabled={support !== "available"}
          onClick={() => setChoice("device")}
        >
          <Fingerprint size={19} />
          デバイス認証
        </button>
        <button
          className={`button ${choice === "pin" ? "button-primary" : "button-secondary"}`}
          onClick={() => setChoice("pin")}
        >
          <LockKeyhole size={19} />
          6桁PIN
        </button>
        <button
          className="text-button"
          disabled={kind === "none"}
          onClick={() => setChoice("none")}
        >
          ロックなし
        </button>
      </div>
      <p className="hint" role="status">
        {support === null
          ? "認証への対応状況を確認しています…"
          : deviceAuthSupportText[support]}
      </p>
      {support !== "available" && (
        <button
          className="text-button"
          disabled={support === null}
          onClick={() => {
            setSupport(null);
            setCheckRevision((value) => value + 1);
          }}
        >
          もう一度確認
        </button>
      )}
      {kind === "device" && !choice && (
        <AsyncForm
          label="認証を試す"
          onSubmit={async () => {
            if (!(await verifyDeviceAuth()))
              throw new Error(
                "認証を完了できませんでした。もう一度お試しください。",
              );
            toast("デバイス認証を確認できました");
          }}
        >
          <p className="hint">
            登録した指紋・顔認証などで、この端末からロックを解除できるか確認します。
          </p>
        </AsyncForm>
      )}
      {choice && (
        <AsyncForm
          label={
            choice === "none"
              ? "ロックを解除する"
              : choice === "device"
                ? "デバイス認証を設定"
                : "PINを設定"
          }
          onSubmit={async (f) => {
            if (
              kind === "pin" &&
              !(await verifyPin(textValue(f, "currentPin")))
            )
              throw new Error("現在のPINが一致しません。");
            if (kind === "device" && !(await verifyDeviceAuth()))
              throw new Error("現在のデバイス認証を完了してください。");
            if (choice === "pin") {
              const pin = textValue(f, "newPin");
              if (pin !== textValue(f, "confirmPin"))
                throw new Error("2回のPINが一致しません。");
              await setPin(pin);
            } else if (choice === "device") await registerDeviceAuth();
            else disableLock();
            notify();
          }}
        >
          {kind === "pin" && (
            <Field label="現在のPIN">
              <input
                type="password"
                name="currentPin"
                inputMode="numeric"
                autoComplete="off"
                pattern="[0-9]{6}"
                maxLength={6}
                required
              />
            </Field>
          )}
          {choice === "pin" && (
            <>
              <Field label="新しい6桁PIN">
                <input
                  type="password"
                  name="newPin"
                  inputMode="numeric"
                  autoComplete="new-password"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                />
              </Field>
              <Field label="PINをもう一度">
                <input
                  type="password"
                  name="confirmPin"
                  inputMode="numeric"
                  autoComplete="new-password"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                />
              </Field>
            </>
          )}
          {choice === "device" && (
            <p className="hint">
              Galaxyの指紋認証・Face ID・Touch
              IDなど、端末で利用できる方法を使います。指紋だけに限定する設定はなく、端末の画面ロックが使われる場合もあります。
            </p>
          )}
        </AsyncForm>
      )}
      <Field label="アプリを離れてから再認証するまで">
        <select
          value={data.settings.lockAfterSeconds}
          onChange={(e) =>
            void run(() =>
              updateSettings({
                lockAfterSeconds: Number(e.target.value) as 0 | 60 | 300 | 900,
              }),
            )
          }
        >
          <option value="0">すぐ</option>
          <option value="60">1分</option>
          <option value="300">5分</option>
          <option value="900">15分</option>
        </select>
      </Field>
      <p className="hint">
        アプリの起動時は毎回認証します。このロックは画面の閲覧を防ぐためのもので、端末内データ自体は暗号化しません。PINはソルト付きハッシュで保存します。バックアップは別途暗号化できます。
      </p>
    </div>
  );
}
