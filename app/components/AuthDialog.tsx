"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AuthActionResult } from "@/app/hooks/useCloudSync";
import { PRIVACY_NOTICE_PATH, type SignupPrivacyConfirmation } from "@/lib/privacy";
import { TERMS_PATH } from "@/lib/operating-policy";
import { saveVisitAnalyticsPreference } from "@/lib/visit-analytics";

type AuthMode = "signin" | "signup";

type AuthDialogProps = {
  googleEnabled: boolean;
  onClose: () => void;
  onGoogle: () => Promise<AuthActionResult>;
  onResetPassword: (email: string) => Promise<AuthActionResult>;
  onSignIn: (email: string, password: string) => Promise<AuthActionResult>;
  onSignUp: (email: string, password: string, confirmation: SignupPrivacyConfirmation) => Promise<AuthActionResult>;
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
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [noticeConfirmed, setNoticeConfirmed] = useState(false);
  const [termsConfirmed, setTermsConfirmed] = useState(false);
  const [analyticsConsent, setAnalyticsConsent] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const closeDialog = () => {
    setEmail("");
    setPassword("");
    setAgeConfirmed(false);
    setNoticeConfirmed(false);
    setTermsConfirmed(false);
    setAnalyticsConsent(false);
    setNotice("");
    onClose();
  };

  const changeMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setNotice("");
    setAgeConfirmed(false);
    setNoticeConfirmed(false);
    setTermsConfirmed(false);
    setAnalyticsConsent(false);
  };

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
  const analyticsBlocked = typeof navigator !== "undefined" && navigator.doNotTrack === "1";

  const applyOptionalAnalytics = (result: AuthActionResult) => {
    // Signup grants a new choice only; existing opt-in/withdrawal remains in privacy settings.
    if (result.ok && mode === "signup" && analyticsConsent && !analyticsBlocked && !saveVisitAnalyticsPreference("allowed")) {
      return `${result.message} 방문 통계는 설정을 저장할 수 없어 켜지 않았어요.`;
    }
    return result.message;
  };

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
      if (result.ok) closeDialog();
      return;
    }
    if (!email.trim() || password.length < 8) {
      setNotice("이메일과 8자 이상의 비밀번호를 입력해 주세요.");
      return;
    }
    if (mode === "signup" && (!ageConfirmed || !noticeConfirmed || !termsConfirmed)) {
      setNotice("연령·개인정보 안내 확인과 이용약관 동의를 완료해 주세요.");
      return;
    }

    setBusy(true);
    const result =
      mode === "signin"
        ? await onSignIn(email, password)
        : await onSignUp(email, password, { ageConfirmed, noticeConfirmed, termsConfirmed });
    setBusy(false);
    setNotice(applyOptionalAnalytics(result));
    if (result.ok && mode === "signin") closeDialog();
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
    if (!ageConfirmed || !noticeConfirmed || !termsConfirmed) {
      setNotice("계정 연결 전에도 연령·개인정보 안내 확인과 이용약관 동의가 필요해요.");
      return;
    }
    setBusy(true);
    const result = await onGoogle();
    setBusy(false);
    setNotice(applyOptionalAnalytics(result));
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
          closeDialog();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy && !passwordRecovery) closeDialog();
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
            onClick={closeDialog}
            type="button"
          >
            ×
          </button>
        )}
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
        {!passwordRecovery && (
          <p className="auth-privacy-intro">
            이메일과 계정 정보를 인증·기록 저장에 사용합니다. 계정 삭제 시 운영 데이터를 지우며 백업 사본에는 별도 안내가 적용됩니다.
            게스트 타이머는 가입 없이 사용할 수 있어요.{" "}
            <a href={PRIVACY_NOTICE_PATH} target="_blank" rel="noopener noreferrer">개인정보 처리방침 <span className="sr-only">(새 탭)</span></a>
            {" · "}<a href={TERMS_PATH} target="_blank" rel="noopener noreferrer">이용약관 <span className="sr-only">(새 탭)</span></a>
          </p>
        )}

        {!passwordRecovery && <div className="auth-dialog-tabs" role="tablist">
          <button
            aria-selected={mode === "signin"}
            className={mode === "signin" ? "active" : ""}
            onClick={() => changeMode("signin")}
            role="tab"
            type="button"
          >
            로그인
          </button>
          <button
            aria-selected={mode === "signup"}
            className={mode === "signup" ? "active" : ""}
            onClick={() => changeMode("signup")}
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
              onChange={(event) => {
                setEmail(event.target.value);
                setAgeConfirmed(false);
                setNoticeConfirmed(false);
                setTermsConfirmed(false);
                setAnalyticsConsent(false);
              }}
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
          {!passwordRecovery && (mode === "signup" || googleEnabled) && (
            <fieldset className="auth-privacy-checks">
              <legend>가입 전 확인</legend>
              <label>
                <input type="checkbox" checked={ageConfirmed} disabled={busy} onChange={(event) => setAgeConfirmed(event.target.checked)} required={mode === "signup"} />
                <span>만 14세 이상입니다. <small>생년월일은 수집하지 않아요.</small></span>
              </label>
              <label>
                <input type="checkbox" checked={noticeConfirmed} disabled={busy} onChange={(event) => setNoticeConfirmed(event.target.checked)} required={mode === "signup"} />
                <span>개인정보 처리방침의 수집 항목·보관·삭제 안내를 확인했습니다.</span>
              </label>
              <label>
                <input type="checkbox" checked={termsConfirmed} disabled={busy} onChange={(event) => setTermsConfirmed(event.target.checked)} required={mode === "signup"} />
                <span>이용약관에 동의합니다. <small>현재 무료 공개 베타로 제공됩니다.</small></span>
              </label>
            </fieldset>
          )}
          {!passwordRecovery && mode === "signup" && (
            <fieldset className="auth-privacy-checks">
              <legend>선택 사항</legend>
              <label>
                <input type="checkbox" checked={analyticsConsent} disabled={busy || analyticsBlocked} onChange={(event) => setAnalyticsConsent(event.target.checked)} />
                <span>서비스 개선을 위한 방문 통계 측정에 동의합니다. (선택)
                  <small>{analyticsBlocked
                    ? "브라우저의 추적 금지 설정에 따라 방문 통계는 사용하지 않아요."
                    : "Cloudflare로 방문·로딩 품질을 측정하며 이메일·공부 내용은 보내지 않아요. 동의하지 않아도 가입할 수 있습니다."}</small>
                  <small>이 브라우저에만 적용돼요. 기존 선택의 변경·철회는 <a href={`${PRIVACY_NOTICE_PATH}#visit-analytics`} target="_blank" rel="noopener noreferrer">개인정보 처리방침 (새 탭)</a>에서 할 수 있어요.</small>
                </span>
              </label>
            </fieldset>
          )}
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
