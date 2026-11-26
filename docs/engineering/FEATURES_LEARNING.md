# 기능 명세: 과목·자료·학습 확인

이 경로는 선택 기능이다. 자료 업로드나 퀴즈를 끝내야 기본 타이머를 쓸 수 있는 구조가 아니다. 현재 추천과 문제 생성은 규칙 기반이며 유료 AI 의미 분석·요약 서비스가 아니다.

## FQ-07 — 과목과 수동 퀘스트

| 입력/상태 | 계약 |
| --- | --- |
| 과목 | 이름 1~60자, 목표 최대 300자, 선택 목표일, 주당 분 0~10,080 |
| 퀘스트 | 제목 1~100자, 완료 기준 최대 500자, 동료·집중 1~120분·휴식 1~30분·목표 1~12세트 |
| 선택 자료 | 같은 소유자의 material(화면에서는 선택 과목 자료), 페이지 범위, 공부법, 예상 분 범위, 안전/기본/도전 목표 |
| 진행 | `planned → in_progress → completed`, `completed_sets ≤ target_sets` |
| 세트 완료 | `complete_study_quest_set(p_quest_id,p_session_id,p_duration_minutes)` |

- **흐름:** 로그인 → 과목 생성 → 수동 퀘스트 등록/수정 → 시작 → 일반 모험 타이머 → 완주 시 세트 반영.
- **권한:** `user_id` RLS에 더해 `(subject_id,user_id)` 복합 외래키로 다른 계정 과목과 연결하지 못하게 한다. 클라이언트 필터만으로 보호하지 않는다.
- **중복 방지:** 세션 ID가 이미 있으면 SQL RPC가 카운터를 다시 올리지 않는다. RPC 안의 insert/update는 같은 DB 트랜잭션이다.
- **실패/복구:** 저장 실패를 화면에 남기고 성공으로 넘기지 않는다. 과목 삭제는 연결된 PDF 원본을 먼저 제거하고 관계 데이터를 삭제한다. 일부 원본 제거 뒤 다음 단계가 실패할 수 있으므로 여러 서비스에 걸친 원자성은 없다. 삭제 대장과 정리 작업을 함께 확인한다.
- **수용:** 빈 제목 거절, 타인 과목/자료 연결 차단, 세트 재전송 중복 증가 없음, 완료 상태/분량 상한 유지.
- **근거:** [QuestBoard](../../app/components/QuestBoard.tsx), [hook](../../app/hooks/useStudyQuests.ts), [도메인](../../lib/study-quests.ts), [관계/RPC](../../supabase/migrations/202607260002_study_quests.sql), [회귀](../../tests/study-quests.test.mjs).

## FQ-08 — 비공개 PDF 자료

**제한:** 계정당 3개, 파일당 15MiB, 120쪽, PDF.js 추출 글자 총상한 160,000, 퀴즈 소스 정규화 총상한 150,000. 글자 상한은 전체 텍스트를 빠짐없이 읽었다는 보장이 아니다. OCR은 없다.

```text
idle → extracting → uploading → indexing → idle
                             ↘ error → 사용자가 원인을 확인하고 재시도
```

1. 파일 형식·크기를 확인하고 브라우저에서 페이지별 텍스트를 추출한다.
2. 사용할 글자가 없으면 실패로 안내하며 업로드를 진행하지 않는다.
3. 인증 사용자 UUID와 새 material UUID로 `userId/materialId/source.pdf`를 만든다. 한글 파일명은 메타데이터에만 저장한다.
4. 비공개 `study-materials` bucket에 `upsert:false`로 원본을 업로드한다.
5. `study_materials`에 준비된 퀴즈 소스·요약 설명·`ready` 상태를 저장한다. 메타데이터 insert 실패 시 원본 제거를 시도한다.

**신뢰 경계:** 로컬 추출은 외부 AI로 전송하지 않는다는 뜻이다. 원본 PDF와 추출된 퀴즈 소스는 계정 기능을 위해 Supabase에 저장된다. “모든 자료가 기기 밖으로 나가지 않는다”라고 안내하면 안 된다.

**한도:** 화면의 개수 확인은 UX일 뿐, 동시 업로드 한도는 Storage trigger의 원자적 카운터로 지킨다. 내부 Storage 연결에서 `auth.uid()`가 비어 있을 수 있어, RLS로 확인된 owner 경로를 기준으로 카운터를 갱신한다.

**삭제:** 원본 제거 후 metadata 제거. 둘 중 하나가 실패하면 오류로 남긴다. 계정 삭제는 metadata에 없는 고아 객체도 소유자 prefix에서 찾는다. metadata 없는 업로드 고아를 일괄 자동 탐지하는 일반 정리기는 현재 없다.

**수용:** 스캔/손상/초과 PDF의 실패 이유 표시, 4번째 동시 업로드 차단, 계정 A의 객체·추출 글자에 B 접근 차단, 단계별 실패가 성공 메시지로 바뀌지 않음. [hook](../../app/hooks/useStudyMaterials.ts), [추출](../../lib/pdf-client.ts), [경로/DTO](../../lib/pdf-analysis.ts), [Storage 정책](../../supabase/migrations/202607280001_study_materials.sql), [원자 한도](../../supabase/migrations/202611250009_operating_policy.sql), [학습 회귀](../../tests/study-quests.test.mjs), [격리 흐름](../../e2e/staging.spec.ts).

## FQ-09 — 도달 페이지·체크포인트·복귀 문제

- **사용자 흐름:** 자료 연결 퀘스트 집중 완료 → 실제 도달 페이지 입력 → 해당 범위 체크포인트 한 문제 또는 건너뛰기 → 휴식 → 같은 범위의 다른 복귀 문제 또는 건너뛰기.
- **문제 생성:** 충분한 길이/용어가 있는 원문 문장에서 용어를 빈칸으로 바꾸고 4지선다를 만든다. 정답 문장·해설은 학습 범위 안에서 찾는다. 오답 보기 용어는 자료의 다른 페이지에서도 가져올 수 있다.
- **비결정적 AI 아님:** 범위·variant로 안정된 ID를 만든다. 이미 푼/거절한 ID를 피하려고 최대 16개 variant를 탐색한다. 후보가 없으면 `null`; 문제를 지어내거나 휴식을 차단하지 않는다.
- **저장:** `study_quest_progress`는 도달 페이지, `study_quiz_attempts`는 단계·범위·응답·정오/건너뜀이다. 퀴즈 품질 응답은 `helpful/unclear/out_of_scope`로 구분한다.
- **복습 우선순위:** 오답 → 15분 회복 복습, 건너뜀 → 10분 복습, 부적합 문제 → 교체, 그 외 → 새 진도. Camp Log의 자신감/난도와 함께 다음 행동에 사용한다.
- **실패/복구:** 네트워크 저장 실패와 문제 없음은 다른 상태다. 도달 범위는 1~120쪽으로 정규화한다. 정답률을 숙련도 시험 성적처럼 보장하지 않는다.
- **수용:** 범위 밖 원문을 정답 문장으로 쓰지 않음, 후보 부족 시 정상 생략, 재시도 중 중복 attempt 증가 방지, 다른 사용자의 진척/문제 기록 접근 차단.
- **근거:** [문제 규칙](../../lib/study-quiz.ts), [진척/추천](../../lib/study-progress.ts), [hook](../../app/hooks/useStudyProgress.ts), [문제 UI](../../app/components/StudyQuizPanel.tsx), [품질 DTO](../../lib/quiz-feedback.ts), [진척/RPC](../../supabase/migrations/202611130001_product_readiness.sql), [회귀](../../tests/study-quests.test.mjs).

## FQ-10 — 로컬 공부 가이드·시험 원정·리포트

| 기능 | 계산/출력 | 한계 |
| --- | --- | --- |
| 로컬 공부 가이드 | 텍스트 내 코드·계산·개념 신호로 concept/calculation/code/mixed, 상위 키워드 5개 | 과목을 의미적으로 완전히 이해하는 AI 아님 |
| 시간 제안 | concept 25/5, calculation·code 40/10, mixed 20/5분 | 과학적 최적 시간 보장 아님; 사용자 수정 가능 |
| 시험 원정 | 남은 세트×집중 시간, 목표일까지 남은 일수, 하루 필요 분과 위험 상태 | 미입력/지난 목표일/완료 상태를 별도 처리 |
| 4주 리포트 | 최근/이전 주간 집중량, 현재 속도 대비 예상 완료 | 기록이 없으면 예측할 수 없음; 학습 성적 예측 아님 |

**수용:** 입력이 같으면 제안이 재현됨, 유료 API 키 없이 동작, 목표일 없는 과목/기록 없는 계정에 허구의 예상일을 넣지 않음, 완료한 퀘스트의 남은 분량은 0. [가이드](../../lib/local-study-coach.ts), [원정 규칙](../../lib/study-quests.ts), [패널](../../app/components/ExamExpeditionPanel.tsx), [가이드 테스트](../../tests/local-study-coach.test.mjs), [퀘스트 테스트](../../tests/study-quests.test.mjs).
