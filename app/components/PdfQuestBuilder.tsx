"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import type { MaterialPhase } from "@/app/hooks/useStudyMaterials";
import type {
  PdfAnalysis,
  PdfQuestSuggestion,
  StudyMaterial,
} from "@/lib/pdf-analysis";
import type {
  QuestDraft,
  StudyQuest,
  StudySubject,
} from "@/lib/study-quests";

type Props = {
  subject: StudySubject;
  materials: StudyMaterial[];
  message: string;
  pageProgress: { completed: number; total: number };
  phase: MaterialPhase;
  onAnalyze: (file: File, subject: StudySubject) => Promise<StudyMaterial | null>;
  onCreateQuest: (draft: QuestDraft) => Promise<StudyQuest | null>;
  onDeleteMaterial: (material: StudyMaterial) => Promise<boolean>;
  onUpdateAnalysis: (materialId: string, analysis: PdfAnalysis) => Promise<boolean>;
};

const phaseLabels: Record<MaterialPhase, string> = {
  idle: "",
  extracting: "PDF에서 글자를 읽고 있어요.",
  uploading: "PDF를 계정에 안전하게 저장하고 있어요.",
  analyzing: "과목 성격과 학습 구간을 해석하고 있어요.",
  saving: "분석 결과를 저장하고 있어요.",
  error: "",
};

function formatBytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export default function PdfQuestBuilder({
  subject,
  materials,
  message,
  pageProgress,
  phase,
  onAnalyze,
  onCreateQuest,
  onDeleteMaterial,
  onUpdateAnalysis,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, PdfAnalysis>>({});
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const [registering, setRegistering] = useState(false);
  const [notice, setNotice] = useState("");

  const subjectMaterials = useMemo(
    () => materials.filter((material) => material.subjectId === subject.id),
    [materials, subject.id],
  );
  const selectedMaterial =
    subjectMaterials.find((material) => material.id === selectedMaterialId) ??
    subjectMaterials.find((material) => material.status === "ready") ??
    subjectMaterials[0] ??
    null;
  const analysis = selectedMaterial
    ? (drafts[selectedMaterial.id] ?? selectedMaterial.analysis)
    : null;
  const busy = phase !== "idle" && phase !== "error";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file || busy) return;
    setNotice("");
    const created = await onAnalyze(file, subject);
    if (!created) return;
    setSelectedMaterialId(created.id);
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const replaceAnalysis = (next: PdfAnalysis) => {
    if (!selectedMaterial) return;
    setDrafts((current) => ({ ...current, [selectedMaterial.id]: next }));
  };

  const updateQuest = (
    index: number,
    patch: Partial<PdfQuestSuggestion>,
  ) => {
    if (!analysis) return;
    replaceAnalysis({
      ...analysis,
      quests: analysis.quests.map((quest, questIndex) =>
        questIndex === index ? { ...quest, ...patch } : quest,
      ),
    });
  };

  const isSelected = (index: number) => {
    if (!selectedMaterial || !analysis) return false;
    const key = `${selectedMaterial.id}:${index}`;
    return selection[key] ?? !analysis.quests[index].registered;
  };

  const registerSelected = async () => {
    if (!selectedMaterial || !analysis || registering) return;
    setRegistering(true);
    setNotice("");
    const registeredIndexes: number[] = [];
    for (let index = 0; index < analysis.quests.length; index += 1) {
      const quest = analysis.quests[index];
      if (quest.registered || !isSelected(index)) continue;
      const created = await onCreateQuest({
        subjectId: subject.id,
        title: quest.title,
        objective: quest.objective,
        adventureId: quest.adventureId,
        focusMinutes: quest.focusMinutes,
        breakMinutes: quest.breakMinutes,
        targetSets: quest.targetSets,
        materialId: selectedMaterial.id,
        sourcePages: quest.sourcePages,
        studyMethod: quest.studyMethod,
        estimatedMinutesMin: quest.estimatedMinutesMin,
        estimatedMinutesMax: quest.estimatedMinutesMax,
        questContract: quest.contract,
      });
      if (!created) break;
      registeredIndexes.push(index);
    }
    if (registeredIndexes.length) {
      const next = {
        ...analysis,
        quests: analysis.quests.map((quest, index) =>
          registeredIndexes.includes(index)
            ? { ...quest, registered: true }
            : quest,
        ),
      };
      replaceAnalysis(next);
      await onUpdateAnalysis(selectedMaterial.id, next);
      setNotice(`${registeredIndexes.length}개 퀘스트를 등록했어요.`);
    } else {
      setNotice("등록할 새 퀘스트를 선택해 주세요.");
    }
    setRegistering(false);
  };

  return (
    <section className="pdf-builder" aria-labelledby="pdf-builder-title">
      <div className="pdf-builder-heading">
        <div>
          <span className="eyebrow">PDF QUEST BUILDER</span>
          <h3 id="pdf-builder-title">자료를 퀘스트로 나누기</h3>
          <p>PDF의 글자를 읽어 페이지 근거와 공부 방법이 있는 퀘스트 초안을 만들어요.</p>
        </div>
        <span className="pdf-limit">PDF · 최대 15MB · 120쪽</span>
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
          <span>{file ? file.name : "분석할 PDF 선택"}</span>
          <small>{file ? formatBytes(file.size) : "스캔 이미지 PDF는 아직 지원하지 않아요."}</small>
        </label>
        <button className="quest-primary" disabled={!file || busy} type="submit">
          {busy ? "분석 중..." : "퀘스트 초안 만들기"}
        </button>
      </form>

      {(busy || message) && (
        <div className={`pdf-status phase-${phase}`} aria-live="polite">
          <strong>
            {phaseLabels[phase] || (phase === "error" ? "PDF 처리 실패" : message)}
          </strong>
          {phase === "extracting" && pageProgress.total > 0 && (
            <span>{pageProgress.completed}/{pageProgress.total}쪽</span>
          )}
          {message && phase !== "idle" && <small>{message}</small>}
        </div>
      )}

      {subjectMaterials.length > 0 && (
        <div className="material-tabs" aria-label="업로드한 PDF">
          {subjectMaterials.map((material) => (
            <button
              className={material.id === selectedMaterial?.id ? "is-active" : ""}
              key={material.id}
              onClick={() => {
                setSelectedMaterialId(material.id);
                setNotice("");
              }}
              type="button"
            >
              <strong>{material.fileName}</strong>
              <small>
                {material.pageCount}쪽 ·{" "}
                {material.status === "ready"
                  ? material.analysisProvider === "openai"
                    ? "AI 분석"
                    : "자료 기반 초안"
                  : material.status === "failed"
                    ? "분석 실패"
                    : "처리 중"}
              </small>
            </button>
          ))}
        </div>
      )}

      {selectedMaterial?.status === "failed" && (
        <div className="pdf-failure">
          <p>{selectedMaterial.errorMessage || "이 PDF를 분석하지 못했어요."}</p>
          <button
            type="button"
            onClick={() => void onDeleteMaterial(selectedMaterial)}
          >
            기록 삭제 후 다시 올리기
          </button>
        </div>
      )}

      {selectedMaterial && analysis && (
        <div className="analysis-review">
          <div className="analysis-summary">
            <div>
              <span>{analysis.provider === "openai" ? "AI 분석" : "자료 기반 초안"}</span>
              <h4>{selectedMaterial.fileName}</h4>
            </div>
            <button
              className="quest-danger"
              onClick={() => {
                if (window.confirm("PDF와 분석 기록을 삭제할까요?")) {
                  void onDeleteMaterial(selectedMaterial);
                }
              }}
              type="button"
            >
              PDF 삭제
            </button>
            <label>
              자료 설명
              <textarea
                maxLength={3000}
                onChange={(event) =>
                  replaceAnalysis({ ...analysis, summary: event.target.value })
                }
                value={analysis.summary}
              />
            </label>
            <div className="analysis-insights">
              <section>
                <strong>과목 이해</strong>
                <p>
                  {analysis.courseProfile.subjectArea} ·{" "}
                  {analysis.courseProfile.materialType}
                </p>
                <small>{analysis.courseProfile.learningGoal}</small>
              </section>
              <section>
                <strong>추천 학습 방식</strong>
                <p>{analysis.courseProfile.recommendedApproach}</p>
              </section>
              <section>
                <strong>퀘스트 분할 기준</strong>
                <p>{analysis.divisionStrategy}</p>
              </section>
            </div>
            {analysis.keyConcepts.length > 0 && (
              <div className="concept-chips">
                {analysis.keyConcepts.map((concept) => (
                  <span key={concept}>{concept}</span>
                ))}
              </div>
            )}
            <p className={`analysis-confidence confidence-${analysis.confidence}`}>
              분석 근거{" "}
              {analysis.confidence === "high"
                ? "충분"
                : analysis.confidence === "medium"
                  ? "보통"
                  : "제한적"}
            </p>
            {analysis.missingEvidence.length > 0 && (
              <details className="analysis-missing">
                <summary>확인이 필요한 정보</summary>
                <ul>
                  {analysis.missingEvidence.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </details>
            )}
            {analysis.warning && <p className="analysis-warning">{analysis.warning}</p>}
          </div>

          <div className="suggestion-list">
            {analysis.quests.map((quest, index) => (
              <article
                className={`suggestion-card ${quest.registered ? "is-registered" : ""}`}
                key={`${selectedMaterial.id}-${index}`}
              >
                <div className="suggestion-select">
                  <label>
                    <input
                      checked={isSelected(index)}
                      disabled={quest.registered}
                      onChange={(event) =>
                        setSelection((current) => ({
                          ...current,
                          [`${selectedMaterial.id}:${index}`]: event.target.checked,
                        }))
                      }
                      type="checkbox"
                    />
                    {quest.registered ? "등록 완료" : `제안 ${index + 1}`}
                  </label>
                  <span>{quest.estimatedMinutesMin}~{quest.estimatedMinutesMax}분 예상</span>
                </div>
                <div className="suggestion-fields">
                  <label>
                    퀘스트명
                    <input
                      maxLength={100}
                      onChange={(event) => updateQuest(index, { title: event.target.value })}
                      value={quest.title}
                    />
                  </label>
                  <label>
                    완료 기준
                    <textarea
                      maxLength={500}
                      onChange={(event) => updateQuest(index, { objective: event.target.value })}
                      value={quest.objective}
                    />
                  </label>
                  <div className="quest-form-row quest-form-row-four">
                    <label>
                      관련 페이지
                      <input
                        maxLength={120}
                        onChange={(event) => updateQuest(index, { sourcePages: event.target.value })}
                        value={quest.sourcePages}
                      />
                    </label>
                    <label>
                      집중/휴식
                      <span className="paired-input">
                        <input type="number" min={10} max={120} value={quest.focusMinutes} onChange={(event) => updateQuest(index, { focusMinutes: Number(event.target.value) })} />
                        <i>/</i>
                        <input type="number" min={3} max={30} value={quest.breakMinutes} onChange={(event) => updateQuest(index, { breakMinutes: Number(event.target.value) })} />
                      </span>
                    </label>
                    <label>
                      목표 세트
                      <input type="number" min={1} max={12} value={quest.targetSets} onChange={(event) => updateQuest(index, { targetSets: Number(event.target.value) })} />
                    </label>
                    <label>
                      모험
                      <select value={quest.adventureId} onChange={(event) => updateQuest(index, { adventureId: event.target.value as PdfQuestSuggestion["adventureId"] })}>
                        <option value="hike">해오름 봉우리 · 등산</option>
                        <option value="swim">유리산호 유적 · 수영</option>
                        <option value="fish">달비늘 호수 · 낚시</option>
                      </select>
                    </label>
                  </div>
                  <label>
                    추천 공부법
                    <textarea
                      maxLength={500}
                      onChange={(event) => updateQuest(index, { studyMethod: event.target.value })}
                      value={quest.studyMethod}
                    />
                  </label>
                  <details className="quest-contract">
                    <summary>안전·기본·도전 목표</summary>
                    <label>안전 목표<input value={quest.contract.safe} onChange={(event) => updateQuest(index, { contract: { ...quest.contract, safe: event.target.value } })} /></label>
                    <label>기본 목표<input value={quest.contract.base} onChange={(event) => updateQuest(index, { contract: { ...quest.contract, base: event.target.value } })} /></label>
                    <label>도전 목표<input value={quest.contract.stretch} onChange={(event) => updateQuest(index, { contract: { ...quest.contract, stretch: event.target.value } })} /></label>
                  </details>
                  <small className="suggestion-rationale">{quest.rationale}</small>
                </div>
              </article>
            ))}
          </div>

          <div className="analysis-actions">
            <button
              disabled={busy}
              onClick={() => void onUpdateAnalysis(selectedMaterial.id, analysis)}
              type="button"
            >
              수정 내용 저장
            </button>
            <button
              className="quest-primary"
              disabled={busy || registering}
              onClick={() => void registerSelected()}
              type="button"
            >
              {registering ? "등록 중..." : "선택한 퀘스트 등록"}
            </button>
            {notice && <span aria-live="polite">{notice}</span>}
          </div>
        </div>
      )}
    </section>
  );
}
