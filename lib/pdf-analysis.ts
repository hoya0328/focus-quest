import {
  parseStudyQuizSource,
  type StudyQuizSource,
} from "./study-quiz.ts";

export const MAX_PDF_BYTES = 15 * 1024 * 1024;
export const MAX_PDF_PAGES = 120;
export const MAX_EXTRACTED_TEXT_CHARACTERS = 160_000;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createStudyMaterialStoragePath(
  userId: string,
  materialId: string,
) {
  if (!UUID_PATTERN.test(userId) || !UUID_PATTERN.test(materialId)) {
    throw new Error("PDF 저장 경로를 만들 수 없어요.");
  }
  return `${userId}/${materialId}/source.pdf`;
}

export type StudyMaterial = {
  id: string;
  userId: string;
  subjectId: string;
  fileName: string;
  storagePath: string;
  fileSizeBytes: number;
  pageCount: number;
  status: "uploaded" | "analyzing" | "ready" | "failed";
  summary: string;
  quizSource: StudyQuizSource | null;
  errorMessage: string;
  createdAt: string;
  updatedAt: string;
};

export type MaterialRow = {
  id: string;
  user_id: string;
  subject_id: string;
  file_name: string;
  storage_path: string;
  file_size_bytes: number;
  page_count: number;
  status: StudyMaterial["status"];
  summary: string;
  analysis: unknown;
  error_message: string;
  created_at: string;
  updated_at: string;
};

export function materialFromRow(row: MaterialRow): StudyMaterial {
  return {
    id: row.id,
    userId: row.user_id,
    subjectId: row.subject_id,
    fileName: row.file_name,
    storagePath: row.storage_path,
    fileSizeBytes: row.file_size_bytes,
    pageCount: row.page_count,
    status: row.status,
    summary: row.summary,
    quizSource: parseStudyQuizSource(row.analysis),
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
