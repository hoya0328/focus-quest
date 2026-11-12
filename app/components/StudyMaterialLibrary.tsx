"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import type { MaterialPhase } from "@/app/hooks/useStudyMaterials";
import type { StudyMaterial } from "@/lib/pdf-analysis";
import type { StudySubject } from "@/lib/study-quests";

type Props = {
  subject: StudySubject;
  materials: StudyMaterial[];
  message: string;
  pageProgress: { completed: number; total: number };
  phase: MaterialPhase;
  onPrepare: (file: File, subject: StudySubject) => Promise<StudyMaterial | null>;
  onDelete: (material: StudyMaterial) => Promise<boolean>;
};

const phaseLabels: Record<MaterialPhase, string> = {
  idle: "",
  extracting: "PDF에서 페이지별 글자를 읽고 있어요.",
  uploading: "PDF를 계정의 비공개 저장소에 보관하고 있어요.",
  indexing: "집중 후 문제를 만들 수 있도록 페이지를 정리하고 있어요.",
  saving: "자료 변경을 저장하고 있어요.",
  error: "",
};

function formatBytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export default function StudyMaterialLibrary({
  subject,
  materials,
  message,
  pageProgress,
  phase,
  onPrepare,
  onDelete,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const subjectMaterials = useMemo(
    () => materials.filter((material) => material.subjectId === subject.id),
    [materials, subject.id],
  );
  const busy = phase !== "idle" && phase !== "error";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file || busy) return;
    const created = await onPrepare(file, subject);
    if (!created) return;
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <section className="pdf-builder" aria-labelledby="study-material-title">
      <div className="pdf-builder-heading">
        <div>
          <span className="eyebrow">STUDY MATERIAL</span>
          <h3 id="study-material-title">집중 범위를 기억하는 자료</h3>
          <p>PDF를 연결하면 집중이 끝난 페이지 안에서 한 문제, 휴식 뒤에 한 문제를 다시 만나요.</p>
        </div>
        <span className="pdf-limit">PDF · 15MB · 120쪽</span>
      </div>

      <form className="pdf-upload" onSubmit={submit}>
        <label>
          <input
            accept="application/pdf,.pdf"
            disabled={busy}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            ref={inputRef}
            type="file"
          />
          <span>{file ? file.name : "공부할 PDF 선택"}</span>
          <small>{file ? formatBytes(file.size) : "텍스트 PDF 지원 · 원본은 계정별 비공개 보관"}</small>
        </label>
        <button className="quest-primary" disabled={!file || busy} type="submit">
          {busy ? "준비 중…" : "퀴즈 자료로 준비"}
        </button>
      </form>

      {(busy || message) && (
        <div className={`pdf-status phase-${phase}`} aria-live="polite">
          <strong>{phaseLabels[phase] || (phase === "error" ? "자료 준비 실패" : message)}</strong>
          {phase === "extracting" && pageProgress.total > 0 && (
            <span>{pageProgress.completed}/{pageProgress.total}쪽</span>
          )}
          {message && phase !== "idle" && <small>{message}</small>}
        </div>
      )}

      {subjectMaterials.length > 0 && (
        <div className="material-library" aria-label="업로드한 공부 자료">
          {subjectMaterials.map((material) => (
            <article key={material.id}>
              <div>
                <strong>{material.fileName}</strong>
                <small>
                  {material.pageCount}쪽 · {material.quizSource ? "복습 퀴즈 준비됨" : "기존 분석 자료"}
                </small>
              </div>
              <button
                className="quest-danger"
                type="button"
                onClick={() => {
                  if (window.confirm("PDF와 연결된 자료 기록을 삭제할까요?")) {
                    void onDelete(material);
                  }
                }}
              >
                PDF 삭제
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
