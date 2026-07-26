# Focus Quest 작업 인계

## 계정과 클라우드 저장

상태: 공개 계정·Supabase 데이터베이스·공개 Worker 배포 완료, Supabase 최종 리디렉션 등록 대기

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

### 다음 작업

1. 공개 URL을 Supabase Site URL과 이메일 리디렉션 허용 목록에 등록한다.
2. 서로 다른 두 계정과 같은 계정의 두 기기로 RLS·동기화를 확인한다.
3. 과목·퀘스트 데이터 모델을 만든 뒤 사용자 소유 데이터로 확장한다.

### 알려진 제한

- 기존 Sites URL은 워크스페이스 외부 계정이 접근할 수 없다.
- 공개 로그인은 Supabase 공개 환경 변수가 설정된 빌드에서만 노출된다.
- Google 로그인은 Supabase와 Google OAuth 설정 후 별도로 활성화해야 한다.
- 이번 단계에서는 타이머 설정·완료 기록·진행 중 세션을 저장하며, 과목·퀘스트·PDF는 아직 포함하지 않는다.
- Codex 내장 브라우저에서는 Cloudflare OAuth를 다시 실행하지 않는다.
