"use client";

import type { StudyQuiz } from "@/lib/study-quiz";

type QuizCardProps = {
  quiz: StudyQuiz;
  answer: number | null;
  onAnswer: (index: number) => void;
};

function QuizCard({ quiz, answer, onAnswer }: QuizCardProps) {
  return (
    <div className="study-quiz-card">
      <span>{quiz.sourcePages} · 1 QUESTION</span>
      <h3>{quiz.question}</h3>
      <div className="study-quiz-options" role="group" aria-label="퀴즈 선택지">
        {quiz.options.map((option, index) => {
          const correct = answer !== null && index === quiz.correctIndex;
          const wrong = answer === index && index !== quiz.correctIndex;
          return (
            <button
              aria-pressed={answer === index}
              className={correct ? "is-correct" : wrong ? "is-wrong" : ""}
              disabled={answer !== null}
              key={`${quiz.id}-${option}`}
              onClick={() => onAnswer(index)}
              type="button"
            >
              <b>{index + 1}</b>{option}
            </button>
          );
        })}
      </div>
      {answer !== null && (
        <div className="study-quiz-feedback" aria-live="polite">
          <strong>{answer === quiz.correctIndex ? "정답이에요!" : "한 번 더 기억해 둘 지점이에요."}</strong>
          <p>{quiz.explanation}</p>
        </div>
      )}
    </div>
  );
}

export function StudyCheckpointPanel({
  startPage,
  endPage,
  reachedPage,
  setReachedPage,
  quiz,
  answer,
  message,
  onBuildQuiz,
  onAnswer,
  onSkip,
}: {
  startPage: number;
  endPage: number;
  reachedPage: string;
  setReachedPage: (value: string) => void;
  quiz: StudyQuiz | null;
  answer: number | null;
  message: string;
  onBuildQuiz: () => void;
  onAnswer: (index: number) => void;
  onSkip: () => void;
}) {
  return (
    <section className="study-checkpoint" aria-labelledby="study-checkpoint-title">
      <div className="study-checkpoint-heading">
        <span>MEMORY CHECKPOINT</span>
        <h2 id="study-checkpoint-title">쉬기 전에, 방금 배운 것을 한 번 꺼내 볼까요?</h2>
        <p>정답은 점수보다 기억을 단단하게 만드는 표식이에요.</p>
      </div>
      {!quiz ? (
        <div className="study-range-form">
          <label>
            이번 집중에서 어디까지 공부했나요?
            <span>
              <b>{startPage}쪽부터</b>
              <input
                inputMode="numeric"
                max={endPage}
                min={startPage}
                onChange={(event) => setReachedPage(event.target.value.replace(/\D/g, ""))}
                type="number"
                value={reachedPage}
              />
              <b>쪽까지</b>
            </span>
          </label>
          <button className="primary-button" onClick={onBuildQuiz} type="button">
            <span>이 범위에서 한 문제 받기</span><strong>→</strong>
          </button>
          <button className="text-button" onClick={onSkip} type="button">이번에는 기록만 하고 쉬기</button>
          {message && <small aria-live="polite">{message}</small>}
        </div>
      ) : (
        <QuizCard answer={answer} onAnswer={onAnswer} quiz={quiz} />
      )}
    </section>
  );
}

export function StudyRecallPanel({
  quiz,
  answer,
  onAnswer,
  onContinue,
  continueLabel,
}: {
  quiz: StudyQuiz;
  answer: number | null;
  onAnswer: (index: number) => void;
  onContinue: () => void;
  continueLabel: string;
}) {
  return (
    <section className="study-checkpoint study-recall" aria-labelledby="study-recall-title">
      <div className="study-checkpoint-heading">
        <span>RECALL GATE</span>
        <h2 id="study-recall-title">다시 출발하기 전, 지난 구간을 깨워요.</h2>
        <p>휴식 전에 봤던 범위를 다른 빈칸으로 짧게 복습합니다.</p>
      </div>
      <QuizCard answer={answer} onAnswer={onAnswer} quiz={quiz} />
      {answer !== null && (
        <button className="primary-button" onClick={onContinue} type="button">
          <span>{continueLabel}</span><strong>→</strong>
        </button>
      )}
    </section>
  );
}
