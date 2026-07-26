"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AuthActionResult } from "@/app/hooks/useCloudSync";

type AuthMode = "signin" | "signup";

type AuthDialogProps = {
  googleEnabled: boolean;
  onClose: () => void;
  onGoogle: () => Promise<AuthActionResult>;
  onResetPassword: (email: string) => Promise<AuthActionResult>;
  onSignIn: (email: string, password: string) => Promise<AuthActionResult>;
  onSignUp: (email: string, password: string) => Promise<AuthActionResult>;
  onUpdatePassword: (password: string) => Promise<AuthActionResult>;
  open: boolean;
  passwordRecovery: boolean;
};

export default function AuthDialog({
  googleEnabled,
  onClose,
  onGoogle,
  onResetPassword,
  onSignIn,
  onSignUp,
  onUpdatePassword,
  open,
  passwordRecovery,
}: AuthDialogProps) {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(
      () =>
        passwordRecovery
          ? passwordRef.current?.focus()
          : emailRef.current?.focus(),
      0,
    );
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open, passwordRecovery]);

  if (!open) return null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice("");
    if (passwordRecovery) {
      if (password.length < 8) {
        setNotice("8자 이상의 새 비밀번호를 입력해 주세요.");
        return;
      }
      setBusy(true);
      const result = await onUpdatePassword(password);
      setBusy(false);
      setNotice(result.message);
      if (result.ok) onClose();
      return;
    }
    if (!email.trim() || password.length < 8) {
      setNotice("이메일과 8자 이상의 비밀번호를 입력해 주세요.");
      return;
    }

    setBusy(true);
    const result =
      mode === "signin"
        ? await onSignIn(email, password)
        : await onSignUp(email, password);
    setBusy(false);
    setNotice(result.message);
    if (result.ok && mode === "signin") onClose();
  };

  const resetPassword = async () => {
    if (!email.trim()) {
      setNotice("먼저 이메일을 입력해 주세요.");
      emailRef.current?.focus();
      return;
    }
    setBusy(true);
    const result = await onResetPassword(email);
    setBusy(false);
    setNotice(result.message);
  };

  const googleSignIn = async () => {
    setBusy(true);
    const result = await onGoogle();
    setBusy(false);
    setNotice(result.message);
  };

  return (
    <div
      className="auth-dialog-backdrop"
      onMouseDown={(event) => {
        if (
          event.target === event.currentTarget &&
          !busy &&
          !passwordRecovery
        ) {
          onClose();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy && !passwordRecovery) onClose();
      }}
      role="presentation"
    >
      <section
        aria-labelledby="auth-dialog-title"
        aria-modal="true"
        className="auth-dialog"
        role="dialog"
      >
        {!passwordRecovery && (
          <button
            aria-label="로그인 창 닫기"
            className="auth-dialog-close"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        )}
        <span className="auth-dialog-eyebrow">CLOUD CAMP</span>
        <h2 id="auth-dialog-title">
          {passwordRecovery
            ? "새 비밀번호 설정"
            : mode === "signin"
              ? "모험 기록 이어하기"
              : "새 모험가 등록"}
        </h2>
        <p>
          {passwordRecovery
            ? "앞으로 사용할 새 비밀번호를 입력해 주세요."
            : "같은 계정으로 로그인하면 PC와 휴대폰에서 타이머와 집중 기록이 이어집니다."}
        </p>

        {!passwordRecovery && <div className="auth-dialog-tabs" role="tablist">
          <button
            aria-selected={mode === "signin"}
            className={mode === "signin" ? "active" : ""}
            onClick={() => {
              setMode("signin");
              setNotice("");
            }}
            role="tab"
            type="button"
          >
            로그인
          </button>
          <button
            aria-selected={mode === "signup"}
            className={mode === "signup" ? "active" : ""}
            onClick={() => {
              setMode("signup");
              setNotice("");
            }}
            role="tab"
            type="button"
          >
            회원가입
          </button>
        </div>}

        <form className="auth-dialog-form" onSubmit={submit}>
          {!passwordRecovery && <label>
            이메일
            <input
              autoComplete="email"
              disabled={busy}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              ref={emailRef}
              type="email"
              value={email}
            />
          </label>}
          <label>
            {passwordRecovery ? "새 비밀번호" : "비밀번호"}
            <input
              autoComplete={
                passwordRecovery || mode === "signup"
                  ? "new-password"
                  : "current-password"
              }
              disabled={busy}
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="8자 이상"
              ref={passwordRef}
              type="password"
              value={password}
            />
          </label>
          <button className="auth-dialog-primary" disabled={busy} type="submit">
            {busy
              ? "연결 중..."
              : passwordRecovery
                ? "새 비밀번호 저장"
                : mode === "signin"
                  ? "로그인하고 이어하기"
                  : "계정 만들기"}
          </button>
        </form>

        {!passwordRecovery && mode === "signin" && (
          <button
            className="auth-dialog-link"
            disabled={busy}
            onClick={resetPassword}
            type="button"
          >
            비밀번호를 잊었나요?
          </button>
        )}

        {!passwordRecovery && googleEnabled && (
          <>
            <div className="auth-dialog-divider">
              <span>또는</span>
            </div>
            <button
              className="auth-dialog-google"
              disabled={busy}
              onClick={googleSignIn}
              type="button"
            >
              Google 계정으로 계속
            </button>
          </>
        )}

        {notice && (
          <p aria-live="polite" className="auth-dialog-notice">
            {notice}
          </p>
        )}
        {!passwordRecovery && (
          <small className="auth-dialog-footnote">
            로그인하지 않아도 타이머는 이 기기에 저장됩니다.
          </small>
        )}
      </section>
    </div>
  );
}
