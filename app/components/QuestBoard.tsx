"use client";

import { useCallback, useMemo, useState, type FormEvent } from "react";
import StudyMaterialLibrary from "@/app/components/StudyMaterialLibrary";
import { useStudyMaterials } from "@/app/hooks/useStudyMaterials";
import type { StudyMaterial } from "@/lib/pdf-analysis";
import type { FocusRecord } from "@/lib/pomodoro";
import type { StudyLearningSignal } from "@/lib/study-progress";
import {
  getExamExpedition,
  getQuestLearningState,
  getRecommendedQuest,
  getSubjectProgress,
  questProgress,
  type QuestDraft,
  type StudyQuest,
  type StudySubject,
  type SubjectDraft,
} from "@/lib/study-quests";

type QuestBoardProps = {
  loggedIn: boolean;
  status: "guest" | "loading" | "ready" | "saving" | "error";
  message: string;
  subjects: StudySubject[];
  quests: StudyQuest[];
  history: FocusRecord[];
  onLogin: () => void;
  onCreateSubject: (draft: SubjectDraft) => Promise<StudySubject | null>;
  onDeleteSubject: (id: string) => Promise<boolean>;
  onCreateQuest: (draft: QuestDraft) => Promise<StudyQuest | null>;
  onUpdateQuest: (id: string, draft: QuestDraft) => Promise<StudyQuest | null>;
  onDeleteQuest: (id: string) => Promise<boolean>;
  onStartQuest: (quest: StudyQuest, material: StudyMaterial | null) => void | Promise<void>;
  getLearningSignal: (questId: string) => StudyLearningSignal;
};

const emptySubject: SubjectDraft = {
  name: "",
  goal: "",
  targetDate: "",
  weeklyMinutes: 300,
};

const emptyQuest = (subjectId = ""): QuestDraft => ({
  subjectId,
  title: "",
  objective: "",
  adventureId: "hike",
  focusMinutes: 25,
  breakMinutes: 5,
  targetSets: 4,
});

const adventureNames = {
  hike: "해오름 봉우리 · 모리",
  swim: "유리산호 유적 · 나루",
  fish: "달비늘 호수 · 보리",
} as const;

export default function QuestBoard({
  loggedIn,
  status,
  message,
  subjects,
  quests,
  history,
  onLogin,
  onCreateSubject,
  onDeleteSubject,
  onCreateQuest,
  onUpdateQuest,
  onDeleteQuest,
  onStartQuest,
  getLearningSignal,
}: QuestBoardProps) {
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [subjectDraft, setSubjectDraft] = useState(emptySubject);
  const [questDraft, setQuestDraft] = useState(emptyQuest());
  const [editingId, setEditingId] = useState<string | null>(null);
  const materialStore = useStudyMaterials(loggedIn);
  const getEffectiveLearningSignal = useCallback(
    (questId: string) => {
      const signal = getLearningSignal(questId);
      const reflection = history.find(
        (record) => record.questId === questId && record.campReflection,
      )?.campReflection;
      if (
        !reflection ||
        (reflection.confidence > 2 && reflection.difficulty !== "heavy")
      ) {
        return signal;
      }
      return {
        ...signal,
        skipped: signal.skipped + 1,
        latestAt: reflection.savedAt,
      };
    },
    [getLearningSignal, history],
  );

  const effectiveSubjectId = subjects.some(
    (subject) => subject.id === selectedSubjectId,
  )
    ? selectedSubjectId
    : (subjects[0]?.id ?? "");

  const visibleQuests = useMemo(
    () => quests.filter((quest) => quest.subjectId === effectiveSubjectId),
    [effectiveSubjectId, quests],
  );
  const subjectMaterials = useMemo(
    () => materialStore.materials.filter((material) => material.subjectId === effectiveSubjectId),
    [effectiveSubjectId, materialStore.materials],
  );
  const activeSubject = subjects.find((subject) => subject.id === effectiveSubjectId) ?? null;
  const activeSubjectProgress = useMemo(
    () => activeSubject
      ? getSubjectProgress({ subject: activeSubject, quests, history })
      : null,
    [activeSubject, history, quests],
  );
  const examExpedition = useMemo(
    () => activeSubject
      ? getExamExpedition({ subject: activeSubject, quests: visibleQuests })
      : null,
    [activeSubject, visibleQuests],
  );
  const recommendedQuest = useMemo(
    () => getRecommendedQuest(visibleQuests, getEffectiveLearningSignal),
    [getEffectiveLearningSignal, visibleQuests],
  );

  const submitSubject = async (event: FormEvent) => {
    event.preventDefault();
    const created = await onCreateSubject(subjectDraft);
    if (!created) return;
    setSubjectDraft(emptySubject);
    setSelectedSubjectId(created.id);
    setQuestDraft(emptyQuest(created.id));
  };

  const submitQuest = async (event: FormEvent) => {
    event.preventDefault();
    const input = { ...questDraft, subjectId: effectiveSubjectId };
    const saved = editingId
      ? await onUpdateQuest(editingId, input)
      : await onCreateQuest(input);
    if (!saved) return;
    setEditingId(null);
    setQuestDraft(emptyQuest(effectiveSubjectId));
  };

  const editQuest = (quest: StudyQuest) => {
    setEditingId(quest.id);
    setQuestDraft({
      subjectId: quest.subjectId,
      title: quest.title,
      objective: quest.objective,
      adventureId: quest.adventureId,
      focusMinutes: quest.focusMinutes,
      breakMinutes: quest.breakMinutes,
      targetSets: quest.targetSets,
      materialId: quest.materialId,
      sourcePages: quest.sourcePages,
      studyMethod: quest.studyMethod,
      estimatedMinutesMin: quest.estimatedMinutesMin,
      estimatedMinutesMax: quest.estimatedMinutesMax,
      questContract: quest.questContract,
    });
  };

  if (!loggedIn) {
    return (
      <section className="quest-board quest-board-guest" aria-labelledby="quest-board-title">
        <div>
          <span className="eyebrow">MY STUDY QUEST</span>
          <h2 id="quest-board-title">공부를 퀘스트로 바꿔보세요</h2>
          <p>로그인하면 과목과 목표를 저장하고 여러 기기에서 이어서 집중할 수 있어요.</p>
        </div>
        <button type="button" className="quest-primary" onClick={onLogin}>
          로그인하고 퀘스트 만들기
        </button>
      </section>
    );
  }

  return (
    <section className="quest-board" aria-labelledby="quest-board-title">
      <header className="quest-board-heading">
        <div>
          <span className="eyebrow">MY STUDY QUEST</span>
          <h2 id="quest-board-title">과목별 퀘스트</h2>
        </div>
        <small className={`quest-sync quest-sync-${status}`}>{message}</small>
      </header>

      <div className="quest-workspace">
        <aside className="subject-panel">
          <div className="subject-tabs" aria-label="과목 목록">
            {subjects.map((subject) => (
              <button
                className={subject.id === effectiveSubjectId ? "is-active" : ""}
                key={subject.id}
                type="button"
                onClick={() => {
                  setSelectedSubjectId(subject.id);
                  setEditingId(null);
                  setQuestDraft(emptyQuest(subject.id));
                }}
              >
                <strong>{subject.name}</strong>
                <small>
                  {quests.filter((quest) => quest.subjectId === subject.id && quest.status === "completed").length}
                  /{quests.filter((quest) => quest.subjectId === subject.id).length} 완료
                </small>
              </button>
            ))}
          </div>

          <details className="quest-form-card" open={subjects.length === 0}>
            <summary>+ 새 과목</summary>
            <form onSubmit={submitSubject}>
              <label>
                과목명
                <input
                  required
                  maxLength={60}
                  value={subjectDraft.name}
                  onChange={(event) => setSubjectDraft({ ...subjectDraft, name: event.target.value })}
                  placeholder="예: 운영체제"
                />
              </label>
              <label>
                목표
                <textarea
                  maxLength={300}
                  value={subjectDraft.goal}
                  onChange={(event) => setSubjectDraft({ ...subjectDraft, goal: event.target.value })}
                  placeholder="예: 기말고사 A 받기"
                />
              </label>
              <div className="quest-form-row">
                <label>
                  목표일
                  <input
                    type="date"
                    value={subjectDraft.targetDate}
                    onChange={(event) => setSubjectDraft({ ...subjectDraft, targetDate: event.target.value })}
                  />
                </label>
                <label>
                  주간 목표(분)
                  <input
                    type="number"
                    min={0}
                    max={10080}
                    value={subjectDraft.weeklyMinutes}
                    onChange={(event) => setSubjectDraft({ ...subjectDraft, weeklyMinutes: Number(event.target.value) })}
                  />
                </label>
              </div>
              <button className="quest-primary" disabled={status === "saving"} type="submit">
                과목 저장
              </button>
            </form>
          </details>
        </aside>

        <div className="quest-main">
          {effectiveSubjectId ? (
            <>
              <div className="quest-list-heading">
                <div>
                  <h3>{activeSubject?.name}</h3>
                  <p>{activeSubject?.goal || "이번 과목의 목표를 향해 출발해요."}</p>
                </div>
                <button
                  className="quest-danger"
                  type="button"
                  onClick={() => {
                    if (window.confirm("과목과 포함된 퀘스트를 모두 삭제할까요?")) {
                      void onDeleteSubject(effectiveSubjectId);
                    }
                  }}
                >
                  과목 삭제
                </button>
              </div>

              {activeSubjectProgress && (
                <section className="subject-progress-summary" aria-label="과목 목표 진행 상황">
                  <div className={`subject-deadline state-${activeSubjectProgress.deadlineState}`}>
                    <span>목표일</span>
                    <strong>{activeSubjectProgress.deadlineLabel}</strong>
                  </div>
                  <div className="subject-weekly-progress">
                    <div>
                      <span>이번 주 과목 집중</span>
                      <strong>
                        {activeSubjectProgress.weeklyMinutes}분
                        {activeSubjectProgress.weeklyTarget > 0 && ` / ${activeSubjectProgress.weeklyTarget}분`}
                      </strong>
                    </div>
                    {activeSubjectProgress.weeklyTarget > 0 ? (
                      <>
                        <span
                          aria-label={`주간 목표 ${activeSubjectProgress.weeklyPercent}% 달성`}
                          aria-valuemax={100}
                          aria-valuemin={0}
                          aria-valuenow={activeSubjectProgress.weeklyPercent}
                          className="subject-weekly-track"
                          role="progressbar"
                        >
                          <i style={{ width: `${activeSubjectProgress.weeklyPercent}%` }} />
                        </span>
                        <small>
                          {activeSubjectProgress.weeklyRemaining > 0
                            ? `${activeSubjectProgress.weeklyRemaining}분 더 집중하면 이번 주 목표에 도착해요.`
                            : "이번 주 목표를 채웠어요."}
                        </small>
                      </>
                    ) : (
                      <small>주간 목표를 정하지 않은 과목이에요.</small>
                    )}
                  </div>
                </section>
              )}

              {examExpedition && examExpedition.totalSets > 0 && (
                <section className={`exam-expedition state-${examExpedition.risk}`} aria-labelledby="exam-expedition-title">
                  <div className="exam-expedition-copy">
                    <span>EXAM EXPEDITION</span>
                    <h3 id="exam-expedition-title">{examExpedition.label}</h3>
                    <p>{examExpedition.message}</p>
                  </div>
                  <div className="exam-expedition-stats">
                    <div>
                      <strong>{examExpedition.completedSets}/{examExpedition.totalSets}</strong>
                      <span>통과한 구간</span>
                    </div>
                    <div>
                      <strong>{examExpedition.dailyMinutes}분</strong>
                      <span>하루 권장</span>
                    </div>
                  </div>
                  <span
                    aria-label={`시험 원정 ${examExpedition.totalSets > 0 ? Math.round((examExpedition.completedSets / examExpedition.totalSets) * 100) : 0}% 완료`}
                    aria-valuemax={100}
                    aria-valuemin={0}
                    aria-valuenow={examExpedition.totalSets > 0 ? Math.round((examExpedition.completedSets / examExpedition.totalSets) * 100) : 0}
                    className="exam-expedition-track"
                    role="progressbar"
                  >
                    <i style={{ width: `${examExpedition.totalSets > 0 ? (examExpedition.completedSets / examExpedition.totalSets) * 100 : 0}%` }} />
                  </span>
                </section>
              )}

              {recommendedQuest && (
                <section className="next-quest-card" aria-labelledby="next-quest-title">
                  <div>
                    <span>다음 한 걸음</span>
                    <h3 id="next-quest-title">{recommendedQuest.title}</h3>
                    <p>
                      {getQuestLearningState(recommendedQuest, getEffectiveLearningSignal(recommendedQuest.id)) === "review"
                        ? "건너뛰었거나 틀린 문제가 있어, 새 진도보다 짧은 복습을 먼저 추천해요."
                        : recommendedQuest.status === "in_progress"
                          ? "이미 걷기 시작한 퀘스트예요. 흐름이 끊기기 전에 이어가 보세요."
                          : "아직 시작하지 않은 가장 가까운 공부 구간이에요."}
                    </p>
                  </div>
                  <button
                    className="quest-primary"
                    onClick={() => onStartQuest(
                      recommendedQuest,
                      materialStore.materials.find((material) => material.id === recommendedQuest.materialId) ?? null,
                    )}
                    type="button"
                  >
                    {getQuestLearningState(recommendedQuest, getEffectiveLearningSignal(recommendedQuest.id)) === "review"
                      ? "복습 시작"
                      : "이어서 집중"}
                  </button>
                </section>
              )}

              <StudyMaterialLibrary
                subject={activeSubject!}
                materials={materialStore.materials}
                message={materialStore.message}
                pageProgress={materialStore.pageProgress}
                phase={materialStore.phase}
                onPrepare={materialStore.preparePdf}
                onDelete={materialStore.deleteMaterial}
              />

              <div className="quest-list">
                {visibleQuests.map((quest) => {
                  const learningState = getQuestLearningState(
                    quest,
                    getEffectiveLearningSignal(quest.id),
                  );
                  return (
                    <article className={`quest-card status-${quest.status} learning-${learningState}`} key={quest.id}>
                      <div className="quest-card-top">
                        <span>{adventureNames[quest.adventureId]}</span>
                        <small>{quest.completedSets}/{quest.targetSets}세트</small>
                      </div>
                      <h4>{quest.title}</h4>
                      {quest.objective && <p>{quest.objective}</p>}
                      {(quest.sourcePages || quest.studyMethod) && (
                        <div className="quest-source">
                          {quest.sourcePages && <span>{quest.sourcePages}</span>}
                          {quest.studyMethod && <small>{quest.studyMethod}</small>}
                        </div>
                      )}
                      <div className="quest-progress" aria-label={`${Math.round(questProgress(quest) * 100)}% 완료`}>
                        <i style={{ width: `${questProgress(quest) * 100}%` }} />
                      </div>
                      <div className="quest-meta">
                        <span>집중 {quest.focusMinutes}분</span>
                        <span>휴식 {quest.breakMinutes}분</span>
                        <span>
                          {learningState === "review"
                            ? "복습 필요"
                            : learningState === "mastered"
                              ? "익힘"
                              : quest.status === "in_progress"
                                ? "진행 중"
                                : "대기"}
                        </span>
                      </div>
                      <div className="quest-actions">
                        <button type="button" onClick={() => editQuest(quest)}>수정</button>
                        <button type="button" onClick={() => void onDeleteQuest(quest.id)}>삭제</button>
                        <button
                          type="button"
                          className="quest-primary"
                          onClick={() => onStartQuest(
                            quest,
                            materialStore.materials.find((material) => material.id === quest.materialId) ?? null,
                          )}
                        >
                          {learningState === "review"
                            ? "복습 시작"
                            : quest.status === "completed"
                              ? "다시 보기"
                              : "집중 시작"}
                        </button>
                      </div>
                    </article>
                  );
                })}
                {visibleQuests.length === 0 && (
                  <p className="quest-empty">아직 퀘스트가 없어요. 첫 공부 단위를 만들어 보세요.</p>
                )}
              </div>

              <form className="quest-form-card quest-editor" onSubmit={submitQuest}>
                <div className="quest-editor-heading">
                  <h3>{editingId ? "퀘스트 수정" : "새 퀘스트"}</h3>
                  {editingId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setQuestDraft(emptyQuest(effectiveSubjectId));
                      }}
                    >
                      취소
                    </button>
                  )}
                </div>
                <label>
                  할 일
                  <input
                    required
                    maxLength={100}
                    value={questDraft.title}
                    onChange={(event) => setQuestDraft({ ...questDraft, title: event.target.value })}
                    placeholder="예: 프로세스 스케줄링 3장 정리"
                  />
                </label>
                <label>
                  완료 기준
                  <textarea
                    maxLength={500}
                    value={questDraft.objective}
                    onChange={(event) => setQuestDraft({ ...questDraft, objective: event.target.value })}
                    placeholder="예: 핵심 개념 노트 1장과 연습문제 10개"
                  />
                </label>
                {subjectMaterials.length > 0 && (
                  <div className="quest-form-row quest-material-range">
                    <label>
                      공부 자료
                      <select
                        value={questDraft.materialId ?? ""}
                        onChange={(event) => {
                          const material = subjectMaterials.find((item) => item.id === event.target.value);
                          setQuestDraft({
                            ...questDraft,
                            materialId: material?.id ?? null,
                            sourcePages: material ? `1~${material.pageCount}쪽` : "",
                          });
                        }}
                      >
                        <option value="">자료 없이 진행</option>
                        {subjectMaterials.map((material) => (
                          <option disabled={!material.quizSource} key={material.id} value={material.id}>
                            {material.fileName}{material.quizSource ? "" : " · 다시 업로드 필요"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      오늘의 목표 페이지
                      <input
                        disabled={!questDraft.materialId}
                        maxLength={120}
                        onChange={(event) => setQuestDraft({ ...questDraft, sourcePages: event.target.value })}
                        placeholder="예: 10~27쪽"
                        value={questDraft.sourcePages ?? ""}
                      />
                    </label>
                  </div>
                )}
                <div className="quest-form-row quest-form-row-four">
                  <label>
                    모험
                    <select
                      value={questDraft.adventureId}
                      onChange={(event) => setQuestDraft({ ...questDraft, adventureId: event.target.value as QuestDraft["adventureId"] })}
                    >
                      <option value="hike">해오름 봉우리 · 등산</option>
                      <option value="swim">유리산호 유적 · 수영</option>
                      <option value="fish">달비늘 호수 · 낚시</option>
                    </select>
                  </label>
                  <label>
                    집중(분)
                    <input type="number" min={1} max={120} value={questDraft.focusMinutes} onChange={(event) => setQuestDraft({ ...questDraft, focusMinutes: Number(event.target.value) })} />
                  </label>
                  <label>
                    휴식(분)
                    <input type="number" min={1} max={30} value={questDraft.breakMinutes} onChange={(event) => setQuestDraft({ ...questDraft, breakMinutes: Number(event.target.value) })} />
                  </label>
                  <label>
                    목표 세트
                    <input type="number" min={1} max={12} value={questDraft.targetSets} onChange={(event) => setQuestDraft({ ...questDraft, targetSets: Number(event.target.value) })} />
                  </label>
                </div>
                <button className="quest-primary" disabled={status === "saving"} type="submit">
                  {editingId ? "수정 저장" : "퀘스트 등록"}
                </button>
              </form>
            </>
          ) : (
            <div className="quest-empty quest-empty-large">
              <strong>먼저 과목을 만들어 주세요.</strong>
              <p>과목 안에 공부 단위를 퀘스트로 등록할 수 있어요.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
