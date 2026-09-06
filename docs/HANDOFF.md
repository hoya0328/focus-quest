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
- OpenAI 구조화 분석과 키·연결 실패 시 무료 자료 기반 분석
- 과목 분야, 자료 유형, 학습 목표, 추천 접근법, 구간 분할 근거, 신뢰도 표시
- 자료 요약, 의미 있는 반복 개념, 페이지, 시간 범위, 공부법, Quest Contract가 있는 3~7개 제안
- 기존에 저장된 분석 기록과 새 분석 형식의 하위 호환
- 제안 전체 수정, 선택 등록, 등록 상태 중복 방지
- 등록 퀘스트와 기존 모험 타이머 연결

### 운영 전 필요

1. `supabase/migrations/202607280001_study_materials.sql`을 적용한다.
2. OpenAI Platform의 `Focus Quest` 프로젝트는 생성했지만, 과금과 API 키 발급은 서비스화 단계까지 보류한다.
3. 실제 AI 분석을 활성화할 때 서버 비밀 값과 사용자별 일일 호출 제한을 함께 설정한다.
4. 그전에는 제목·반복 개념·페이지 분량을 사용하는 무료 분석으로 PDF 업로드부터 퀘스트 등록까지의 흐름을 유지한다.

### 다음 작업

- 1-4 Camp Log: 완료 직후 회상, 자신감, 실제 범위와 체감 난도 수집
- 실제 소요 시간으로 PDF 퀘스트 예상 범위를 보정

## 2026-07-30 — 타이머 중심 첫 화면

### 완료

- 첫 화면을 `오늘의 한 가지` 입력과 10·25·45분 빠른 시작 중심으로 재구성
- 마지막으로 선택한 모험 친구·집중 소리를 유지하고, 친구 변경과 세부 설정을 보조 영역으로 이동
- 목표 입력을 진행 중 세션·완료 기록·최근 모험까지 연결
- 입력하지 않은 경우 `자유 집중`으로 안전하게 시작
- 중단 시 홈으로 복귀하고, 다른 기기에서 세션이 해제된 경우에도 첫 화면으로 복구
- PC·태블릿·모바일용 반응형 빠른 시작 레이아웃
- 기존 계정 동기화 형식과 과거 기록을 깨지 않는 선택 필드 방식으로 데이터 확장

### 검증

- 집중·클라우드·PWA·공개 인증 로직 테스트 22개 통과
- TypeScript 검사 통과
- 변경 파일 ESLint 오류 0개

### 다음 작업

- 완료 직후 `끝냈어요 / 더 할래요 / 더 작게 나눌래요` 선택을 제공하는 Camp Log
- 한 번의 탭으로 직전 목표·시간을 재시작하는 최근 모험 카드

## 2026-07-30 — 모험 세계관·메인 픽셀 배경 고도화

### 완료

- 캐릭터 이름, 역할, 지역명, 목표 사건을 세 모험에 맞춰 일관되게 재작성
- 메인 전체 배경과 선택 장면에 실제 집중 장면용 고해상도 픽셀 배경 연결
- 캐릭터를 배경의 동선과 여백에 맞춰 지역별로 배치
- 숨겨져 있던 친구 변경을 세 지역이 항상 보이는 `모험 지도` 카드로 변경
- 과목 퀘스트와 PDF 퀘스트의 모험 선택 명칭 및 장면 접근성 설명까지 새 세계관으로 통일
- 새 이미지를 생성하지 않고 기존 원본 에셋을 재사용해 용량과 제작 비용 증가 방지

### 검증

- TypeScript 검사 통과
- 퀘스트·타이머 연결 테스트 10개 통과
- 변경 파일 ESLint 오류 0개
- 공개 운영 빌드 통과

## 2026-08-11 — 다음 기능 기획 제안

- AI 과금 전에는 타이머의 반복 사용 루프를 우선 검증한다.
- 제안된 P0 순서는 `Camp Log Lite → 여러 세트 원정 → 지난 모험 다시 시작 → 종료 알림·미니 타이머`다.
- 다음 작업자는 사용자가 승인한 첫 항목만 기능 개발 범위로 확정하고, 나머지는 백로그로 유지한다.
- 북극성 지표는 `주 3회 이상 이름 있는 집중 모험을 완주한 사용자 수`다.

## 2026-08-11 — Camp Log Lite

### 완료

- 집중 완료 화면에서 `끝냈어요 / 조금 남았어요 / 더 작게 나눌래요` 결과 선택
- 선택 결과를 최근 모험 기록과 계정 클라우드 상태에 저장
- 완료는 설정된 휴식, 조금 남음은 같은 목표 10분 추가 집중으로 연결
- 목표 축소는 원래 목표명을 유지한 5·10분 미니 퀘스트로 연결
- 후속 집중이 기본 집중 시간 설정을 덮어쓰지 않도록 분리
- PC 3열·모바일 1열의 키보드 및 터치 대응 UI
- 과거 기록, 여러 기기 중복 기록, 선택 결과 병합의 하위 호환 유지

### 검증

- Camp Log 및 클라우드 병합 로직 테스트 19개 통과
- TypeScript 검사 통과
- 변경 파일 ESLint 오류 0개(기존 이미지 최적화 경고 6개만 유지)

### 다음 작업

- 여러 집중·휴식 세트를 하나의 원정으로 잇는 `여러 세트 원정`
- 최근 기록에서 한 번에 같은 목표를 시작하는 `지난 모험 다시 시작`

## 2026-08-11 — 결제 없는 타이머 로드맵 일괄 개발

### 완료

- 2~4세트 원정과 집중·휴식 체크포인트, 마지막 세트 전용 성공 연출
- 원정 ID·구간 번호의 로컬 및 계정 클라우드 기록 호환
- 최근 모험의 `이어가기 / 다시 도전` 한 번 탭 재시작
- 중단 목표를 5·10분으로 줄이는 Recovery Quest
- 사용자 허용형 세션 종료 알림과 앱 실행 중 일정 알림
- 지원 브라우저용 Document Picture-in-Picture 미니 타이머
- 모험별 완주 횟수로 늘어나는 깃발·산호·호수 불빛과 월드 레벨
- 최근 목표를 기억하는 규칙 기반 Companion Memory
- 자주 완주한 집중 길이·시간대·목표 작성률 리포트
- Supabase Realtime Presence 기반 초대 코드형 Silent Camp 베타

### 의도적으로 보류

- 비용과 호출 제한이 필요한 실제 OpenAI Quest 추천
- 백그라운드 푸시 서버가 필요한 앱 종료 상태의 예약 알림
- Silent Camp 채팅, 공개 랭킹, 목표 내용 공유

### 검증

- 원정·복귀·행동 분석·클라우드 호환 핵심 로직 테스트 21개 통과
- TypeScript 검사 통과
- 변경 파일 ESLint 오류 0개(기존 이미지 최적화 경고만 유지)

### 사용자 QA 권장 순서

1. 1분 집중·1분 휴식·2세트 원정으로 중간 체크포인트와 마지막 성공 장면 확인
2. 집중 중 그만두기 후 홈의 Recovery Quest 확인
3. 최근 모험의 이어가기와 다시 도전 확인
4. Chrome에서 알림 권한과 작은 타이머 확인
5. 다른 브라우저 또는 계정에서 같은 Silent Camp 코드로 인원수 확인

## 2026-08-11 — 자체 QA

- 자동 테스트 28개, 운영 빌드, TypeScript, 변경 파일 ESLint를 통과했다.
- 운영 의존성 취약점은 0건으로 정리했고 Cloudflare 런타임 렌더링 검증을 복구했다.
- 휴식 세션에 노출되던 집중용 PiP 버튼을 수정했다.
- 브라우저 자동 조작 장애로 남은 실제 상호작용 검증은 `docs/QA_REPORT_2026-08-11.md`의 수동 QA 7개 항목을 따른다.
- 이 QA 보수 변경은 아직 운영에 배포하지 않았다.

## 2026-09-06 — 공개 포트폴리오 및 배포 복구

- 공개 README에 배포 상태 배지와 저장소 운영 정책을 추가했다.
- 기여·보안·권리 고지와 구조화된 이슈·PR 템플릿을 추가했다.
- PDF.js worker를 기본 export에 의존하지 않는 URL 방식으로 바꿔 Linux 정적 빌드 실패를 수정했다.
- GitHub Actions를 Node 24 대응 공식 액션으로 갱신했다.
- 릴리스 후보는 로컬 전체 검증과 GitHub Pages 재배포 성공 뒤 확정한다.
