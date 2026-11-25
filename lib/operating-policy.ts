export const OPERATING_POLICY_VERSION = "2026-11-25.1";
export const TERMS_VERSION = "2026-11-25";
export const TERMS_PATH = "/terms";
export const BACKUP_RETENTION_DAYS = 30;
export const EVENT_RETENTION_DAYS = 90;
export const RESOLVED_CASE_RETENTION_DAYS = 90;
export const MAX_STUDY_PDFS = 3;
export const MAX_STUDY_PDF_TOTAL_BYTES = 45 * 1024 * 1024;
export function expirationDate(createdAt: string, days = BACKUP_RETENTION_DAYS) {
  const time = Date.parse(createdAt);
  if (!Number.isFinite(time) || !Number.isInteger(days) || days < 1 || days > 365) {
    throw new Error("Invalid retention date.");
  }
  return new Date(time + days * 86_400_000).toISOString();
}
