export const PRIVACY_NOTICE_PATH = "/privacy";
import { TERMS_VERSION } from "./operating-policy.ts";

export const PRIVACY_NOTICE_VERSION = "2026-11-25.1";
export const PRIVACY_CONTACT = {
  name: "조병호",
  email: "letshoya@naver.com",
} as const;

export type SignupPrivacyConfirmation = {
  ageConfirmed: boolean;
  noticeConfirmed: boolean;
  termsConfirmed: boolean;
};

// This is a notice acknowledgement and age self-declaration, not identity verification.
// User metadata must never be used as an authorization or administrator boundary.
export function signupPrivacyMetadata(
  confirmation: SignupPrivacyConfirmation,
  now = new Date(),
) {
  if (confirmation?.ageConfirmed !== true || confirmation.noticeConfirmed !== true || confirmation.termsConfirmed !== true) return null;
  return {
    age_over_14_declared: true,
    privacy_notice_version: PRIVACY_NOTICE_VERSION,
    terms_version: TERMS_VERSION,
    privacy_notice_acknowledged_at: now.toISOString(),
  };
}
