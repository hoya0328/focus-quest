# 개발 시작 안내

## 1. 준비와 실행

- Node.js는 [package.json](../../package.json)의 `engines`와 CI의 Node 22 계열을 맞춘다. npm과 `package-lock.json`을 유지한다.
- 이 저장소 루트에서 `Focus Quest.code-workspace`를 열고 작업한다. 다른 서비스·예전 경로를 의존성으로 쓰지 않는다.
- `git status --short`로 기존 수정 사항을 확인한다. 다른 사람의 수정은 초기화하지 않는다.

```bash
npm ci
npm run dev
```

실제 로컬 주소는 Vite 출력으로 확인한다. 포트가 점유됐다면 다른 프로세스를 임의 종료하지 않는다. 종료는 이 작업에서 실행한 서버에만 한다.

`.env.example`을 참고해 Git 제외된 `.env.local`을 준비한다. 예시 값을 실제 비밀값으로 채운 뒤 커밋하지 않는다. 게스트 타이머와 계정 기능은 설정 범위가 다르다. 공개 인증 환경을 사용하는 로컬 앱은 운영 데이터에 연결될 수 있으므로 개발용 계정/프로젝트를 우선한다.

## 2. 환경 변수 경계

| 위치 | 이름 | 용도/취급 |
| --- | --- | --- |
| 브라우저 빌드 | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 공개 가능한 접속 설정. 보안 경계는 Auth·RLS이며 이 키를 비밀키로 취급하지 않는다 |
| 브라우저 빌드 | `NEXT_PUBLIC_ENABLE_GOOGLE_AUTH` | 기본 false. 제공자와 redirect 검증 없이 true로 바꾸지 않는다 |
| 브라우저 빌드 | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Push 공개키. private key와 혼동하지 않는다 |
| Worker 바인딩/Secret | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | 계정 삭제·Push·보관 정리의 서버 권한. `NEXT_PUBLIC_` 금지 |
| Worker 바인딩/Secret | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Push 발송. 브라우저 공개키와 쌍이 맞아야 한다 |
| 로컬 운영 프로세스만 | `BACKUP_ENCRYPTION_KEY` | Windows DPAPI 외 환경용 32바이트 Base64 키. 터미널 이력·문서·Git에 값 기록 금지 |

`.env.example`의 `OPENAI_API_KEY`/`OPENAI_MODEL`은 과거 확장용 예시다. 현재 PDF 가이드/퀴즈 경로는 호출하지 않는다. 이 값을 넣었다고 유료 AI 기능이 연결되지 않는다. `.env.staging.example`과 [격리 검증 스크립트](../../scripts/verify-staging-env.mjs)는 운영 프로젝트를 테스트 대상으로 잘못 쓰는 것을 방지한다.

## 3. 코드 탐색

| 수정할 내용 | 출발점 |
| --- | --- |
| 화면 이동·완료 순서·작은 타이머·오디오 | [app/page.tsx](../../app/page.tsx) |
| 타이머 계산·기록 파싱 | [pomodoro](../../lib/pomodoro.ts) |
| 저장 병합·로그인/로그아웃 | [cloud-state](../../lib/cloud-state.ts), [useCloudSync](../../app/hooks/useCloudSync.ts) |
| 모험 시각 연출 | [AdventureQuestScene](../../app/components/AdventureQuestScene.tsx), [FishingQuestScene](../../app/components/FishingQuestScene.tsx), [RestQuestScene](../../app/components/RestQuestScene.tsx) |
| 과목/PDF/퀴즈 | `app/hooks/useStudy*`, [학습 명세](FEATURES_LEARNING.md) |
| 캠프·Presence·채팅 | [useSilentCamp](../../app/hooks/useSilentCamp.ts), [공동 집중 명세](FEATURES_PLATFORM.md) |
| 서버·배포·스케줄 | [Worker](../../worker/index.ts), [런북](../OPERATIONS_RUNBOOK.md) |

`app/page.tsx`는 큰 조합 계층이다. 단순 주석 작업을 핑계로 전체를 재작성하지 않는다. 추출할 경우 입력·출력·상태 전이 단위로 작게 나누고 기존 회귀를 유지한다. Phaser에 타이머 완료·저장 권한을 넘기지 않는다.

## 4. 첫 변경 완료 조건

1. 관련 기능 ID와 성공/실패 조건을 읽는다.
2. 순수 계산은 `lib/`, 외부 조회·화면 동기화는 hook, 표현은 component, 서버 권한은 Worker/SQL에 둔다.
3. 새 외부 호출·환경 변수·데이터 수집·권한 변경이 있는지 검토한다.
4. [검증 기준](QUALITY.md)에 따라 필요한 검사만 실행한다.
5. 관련 명세·소스 지도·테스트를 같이 갱신하고 diff를 확인한다.

## 5. 인계 시 전달하는 것 / 전달하지 않는 것

- 전달: 소스·lockfile, 마이그레이션, 이 명세, 테스트 명령, 환경 변수 **이름**, 사업자 접근권한이 필요한 역할 목록.
- 별도 승인된 비공개 채널: 사업자 계정 초대, 운영 Secret 설정, 암호화 백업과 키의 분리 전달. 비밀번호 공유보다 역할별 계정 초대를 사용한다.
- 전달 금지: 저장소에 키를 넣는 방식, 실제 공부 PDF/채팅/이메일을 테스트 fixture로 복사, 인증 링크나 토큰을 이슈에 첨부.
- 현재 외부 백업·독립 키 복구는 미구성이다. 문서가 있다는 이유로 복구 체계를 완료로 표시하지 않는다.
