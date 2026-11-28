# 검증·코드 리뷰 기준

## 변경 위험에 맞춘 실행

| 변경 | 최소 검사 | 위험이 넓어질 때 추가 |
| --- | --- | --- |
| 명세·주석만 | `docs:check`, diff, lint/typecheck | `docs:check -- --comments-only`로 런타임 AST 동일성 확인 |
| 순수 타이머/성장/추천 | 해당 `tests/*.test.mjs` | `test:logic` |
| 화면·반응형·키보드 | lint/typecheck, 해당 Playwright spec | PC·모바일·태블릿 실제 캡처, `DESIGN.md` 대조 |
| Auth/저장/계정 경계 | cloud/public-auth/privacy 규칙 | 격리 Supabase E2E, 소유자 A/B/익명 양성·음성 대조 |
| PDF/Storage/RPC | study-quests/operating-policy 규칙 | 격리 업로드/동시 한도/삭제·부분 실패 E2E |
| 캠프/Push | silent-camp/push/PWA 규칙 | 격리 두 브라우저, 실제 OS 알림·실기기 |
| 배포 후보 | build/render/budget/secrets/audit | GitHub 일반·격리 workflow + 운영 읽기 전용 smoke |

```bash
npm run docs:check
npm run test:docs
npm run lint
npx tsc --noEmit
node --test tests/pomodoro.test.mjs tests/cloud-state.test.mjs
```

위 예시는 로컬 비파괴 검사다. `npm run test:e2e`는 앱을 빌드하고 로컬 preview를 띄운다. 격리 테스트는 별도 Supabase와 합성 계정을 사용하며 env 검증을 우회하지 않는다. 실제 공부 25분을 기다리는 대신 시간 주입/브라우저 시계로 자동 검증한다.

## 테스트 지도

| 계약 | 주요 파일 |
| --- | --- |
| FQ-01~04: 시작·시간·완료·복귀 | [pomodoro](../../tests/pomodoro.test.mjs), [retention](../../tests/retention.test.mjs), [가상 QA 회귀](../../tests/virtual-user-qa.test.mjs), [guest](../../e2e/guest.spec.ts), [responsive](../../e2e/responsive.spec.ts) |
| FQ-05: 성장 | [archive](../../tests/adventure-archive.test.mjs), [season](../../tests/seasonal-events.test.mjs), [world-growth](../../e2e/world-growth.spec.ts) |
| FQ-06: 계정·병합 | [cloud-state](../../tests/cloud-state.test.mjs), [public-auth](../../tests/public-auth.test.mjs) |
| FQ-07~10: 학습 | [study-quests](../../tests/study-quests.test.mjs), [guide](../../tests/local-study-coach.test.mjs), [staging](../../e2e/staging.spec.ts) |
| FQ-11~13: 캠프·알림·운영 신호 | [camp](../../tests/silent-camp.test.mjs), [push](../../tests/push-reminders.test.mjs), [PWA](../../tests/pwa.test.mjs), [operations](../../tests/operations.test.mjs) |
| FQ-14~15: 개인정보·백업 | [privacy](../../tests/privacy.test.mjs), [retention safety](../../tests/operating-policy.test.mjs), [문서 화면](../../e2e/privacy.spec.ts) |
| FQ-16: 검색·운영 통계·선택형 분석 | [권한/집계](../../tests/launch-analytics.test.mjs), [화면](../../e2e/launch.spec.ts) |
| 문의·설치 | [입력/운영 권한](../../tests/support-requests.test.mjs), [기기별 UI](../../e2e/support-install.spec.ts), [운영 DB 역할별 롤백 검사](../../supabase/tests/support_inbox_security.sql) |

일부 보안 회귀는 SQL/소스의 정책 구조를 검사한다. 이것은 실제 DB 권한 검증과 다르다. 격리 `staging.spec.ts`는 합성 계정·원본 PDF·캠프·권한을 실제 경로로 검증한다. 운영 익명 검사만 성공했다고 소유자 정상 접근까지 검증됐다고 말하지 않는다.

## PR 리뷰 체크

전체 route CSS 합계 예산은 240KB다. 운영자 전용 CSS 약 6.3KB와 선택형 분석 설정 UI를 포함한 값이며 한 번의 홈 방문에서 모든 route CSS를 불러온다는 뜻은 아니다. 개별 JS 1.25MB·전체 JS 2.6MB·이미지 2.6MB 예산은 유지한다.

첫 화면의 모험 미리보기·로고 합계는 모바일 260KB, 데스크톱 370KB 이하다. 원본 아트를 바꾼 경우 `node scripts/build-entry-previews.mjs`로 축소 자산을 갱신하고, 반응형 회귀에서 첫 화면이 원본 아트를 요청하는지 확인한다.

- 기존 동작을 바꾸는가, 명세/회귀가 그 변경을 설명하는가?
- 날짜/분/초/ms, session ID, cloud revision/schemaVersion을 혼동하지 않았는가?
- loading/empty/error/retry/expired/offline 상태와 중복 클릭을 처리했는가?
- 권한은 서버·RLS/RPC/Storage에서 검사하는가? 화면에서 숨기기만 하지 않았는가?
- 로그/이벤트/캠프에 목표·PDF·회상·키가 섞이지 않는가?
- 브라우저 지원/실기기/미실행 항목을 완료로 쓰지 않았는가?
- 정상 동작 중인 서비스·운영 데이터를 QA 목적으로 삭제하거나 복원하지 않았는가?
- 검증한 커밋과 배포 대상이 일치하는가? 롤백 UI가 현재 가입 trigger 버전과 호환되는가?

## 자동 문서 검사 범위

`docs:generate`는 지정된 소스 파일을 정렬해 export 위치와 최신 SQL 정의 위치를 만든다. timestamp·현재 사용자·실행 로그를 생성물에 넣지 않는다. `docs:check`는 생성물 drift, 문서의 로컬 링크, FQ-01~16 존재, 전체 테이블의 데이터 사전 포함, OpenAPI HTTP 메서드 일치를 검사한다. `--comments-only`는 기존 런타임 파일의 변경 전/후 AST 구조·토큰·리터럴값을 비교한다. 줄 위치·서식·주석은 비교하지 않는다. 소스 지도 생성물은 자동 수정해도 되지만 의미 명세는 코드 리뷰가 필요하다. `test:docs`는 주석·줄바꿈 변경의 허용과 실제 리터럴/연산자/JSX 변경 탐지를 회귀 검사한다.

## 결과 기록의 경계

Git에 넣을 기술 문서는 계약·테스트 방법·알려진 제한을 담는다. 실제 사용자 레코드, CLI 자격 증명, 담당자의 개인 작업 순서, 상세 실행/승인 로그는 넣지 않는다. 실행 증거가 필요하면 Git 제외된 접근 제한 기록을 사용한다. 가상 시나리오를 실제 사용자 연구 결과라고 표시하지 않는다.
