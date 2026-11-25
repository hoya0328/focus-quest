export const PRIVACY_NOTICE_PATH = "/privacy";
export const PRIVACY_NOTICE_VERSION = "2026-11-25";
export const PRIVACY_CONTACT = {
  name: "조병호",
  email: "letshoya@naver.com",
} as const;

export type SignupPrivacyConfirmation = {
  ageConfirmed: boolean;
  noticeConfirmed: boolean;
};

// This is a notice acknowledgement and age self-declaration, not identity verification.
// User metadata must never be used as an authorization or administrator boundary.
export function signupPrivacyMetadata(
  confirmation: SignupPrivacyConfirmation,
  now = new Date(),
) {
  if (confirmation?.ageConfirmed !== true || confirmation.noticeConfirmed !== true) return null;
  return {
    age_over_14_declared: true,
    privacy_notice_version: PRIVACY_NOTICE_VERSION,
    privacy_notice_acknowledged_at: now.toISOString(),
  };
}
