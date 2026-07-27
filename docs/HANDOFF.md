# Focus Quest 작업 인계

## 2026-07-28 PDF upload repair

- Diagnosis: the bucket, PDF MIME limit, and Storage policies existed, while the object key still included the original Unicode file name.
- Repair: uploads now use `<user UUID>/<material UUID>/source.pdf`; the original name remains available in the database and UI.
- Recovery: Storage authentication, policy, bucket, and status failures now produce distinct user-facing guidance.
- UX: the error status has a stable heading and no longer repeats the same generic sentence.
- Analysis save repair: sanitize NUL characters and stop requiring a full returned row after a successful update.
- Focused validation: 9 PDF/quest tests, TypeScript, and changed-file ESLint passed.

## 계정과 클라우드 저장

상태: 공개 계정·Supabase 데이터베이스·공개 Worker 배포·운영 리디렉션 등록 완료

### 완료

- 게스트 사용 유지
- 선택형 ChatGPT 계정 상태 UI
- D1 `user_cloud_states` 스키마와 마이그레이션
- 로컬 설정·집중 기록의 첫 업로드
- 다른 기기 기록 병합과 중복 제거
- 버전 기반 저장 충돌 감지
- 진행 중 타이머의 다기기 시작·일시정지·재개·완료 동기화
- 10초 주기 및 화면 복귀 시 최신 상태 확인
- 같은 세션의 다기기 중복 완료 방지
- 클라우드 저장 상태·오류·비활성 UI
- 클라우드 기록 삭제 후 기기 기록 보존

### 검증

- TypeScript 검사 통과
- 클라우드 상태 파싱·병합을 포함한 로직 테스트 12개 통과
- 로컬 D1 API의 시작·일시정지·충돌(409)·완료·삭제 흐름 통과
- 변경 파일 ESLint 오류 0개
- 프로덕션 빌드 통과
- PWA 업데이트 시 이전 HTML과 새 정적 파일이 엇갈리지 않도록 네트워크 우선 갱신 및 구버전 캐시 제거 적용
- Supabase 이메일 회원가입·로그인·로그아웃·비밀번호 재설정 UI
- Supabase 세션을 사용하는 다기기 동기화 어댑터
- 사용자별 RLS SQL 마이그레이션
- 서울 리전 Supabase 프로젝트 생성 및 RLS SQL 적용
- Supabase 이메일 가입 활성화와 Auth API 연결 확인
- 선택형 Google OAuth와 공개 Cloudflare Worker 배포 구성
- Supabase가 설정되지 않은 기존 Sites 환경의 ChatGPT+D1 호환
- 기존 Phaser 이미지 태그 관련 ESLint 경고 5개는 이번 기능과 무관해 유지
- Cloudflare OAuth를 일반 Windows 터미널과 외부 브라우저에서만 진행하는 충돌 방지 절차
- Cloudflare 이메일 인증 및 계정 `workers.dev` 하위 주소 등록
- 공개 Worker 배포: `https://focus-quest.hoya0328.workers.dev`
- Supabase Site URL과 이메일 리디렉션 허용 목록에 공개 주소 등록
- 공개 주소 `200 OK`, Focus Quest 화면과 Supabase 로그인 UI 응답 확인
- 게스트 기록은 소유자 표식이 없을 때만 첫 계정으로 이전
- 계정 전환 시 이전 계정의 로컬 기록·진행 중 세션 격리
- 로그아웃 전 마지막 저장 완료 및 실패 시 안전 중단
- 로그아웃 후 공용 화면 초기화와 재로그인 시 클라우드 복구
- 클라우드 삭제·비활성 상태를 계정별로 분리
- 인증 초기화 10초 제한과 오류 복구 메시지
- 계정 동기화 집중 테스트 명령 `npm run test:account-sync`
- 계정·게스트·다기기·재로그인·격리 시나리오 테스트 통과
- 운영 Supabase 익명 접근 차단 `401` 확인

### 다음 작업

1. 과목·퀘스트 데이터 모델을 만든 뒤 사용자 소유 데이터로 확장한다.

### 알려진 제한

- 기존 Sites URL은 워크스페이스 외부 계정이 접근할 수 없다.
- 공개 로그인은 Supabase 공개 환경 변수가 설정된 빌드에서만 노출된다.
- Google 로그인은 Supabase와 Google OAuth 설정 후 별도로 활성화해야 한다.
- 이번 단계에서는 타이머 설정·완료 기록·진행 중 세션을 저장하며, 과목·퀘스트·PDF는 아직 포함하지 않는다.
- Codex 내장 브라우저에서는 Cloudflare OAuth를 다시 실행하지 않는다.

## 2026-07-28 — PDF 분석 MVP

### 완료

- PDF 형식·15MB·120쪽 제한과 오류 안내
- PDF.js 기반 페이지별 브라우저 텍스트 추출
- 사용자 전용 Supabase Storage 및 `study_materials` 데이터 모델
- 로그인 토큰을 검증하는 `/api/analyze-pdf`
- OpenAI 구조화 분석과 키·연결 실패 시 기본 분석
- 자료 요약, 개념, 페이지, 시간 범위, 공부법, Quest Contract가 있는 3~7개 제안
- 제안 전체 수정, 선택 등록, 등록 상태 중복 방지
- 등록 퀘스트와 기존 모험 타이머 연결

### 운영 전 필요

1. `supabase/migrations/202607280001_study_materials.sql`을 적용한다.
2. 실제 AI 분석이 필요하면 `OPENAI_API_KEY`를 공개 Worker와 Sites의 서버 비밀 값으로 등록한다.
3. 키가 없으면 기본 분석이 사용되며 PDF 업로드부터 퀘스트 등록까지의 흐름은 유지된다.

### 다음 작업

- 1-4 Camp Log: 완료 직후 회상, 자신감, 실제 범위와 체감 난도 수집
- 실제 소요 시간으로 PDF 퀘스트 예상 범위를 보정
