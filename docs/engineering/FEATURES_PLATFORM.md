# 기능 명세: 공동 집중과 서비스 기능

## FQ-11 — Silent Camp 비공개 캠프

- **전제:** 로그인 필요. `idle → connecting → joined/error`. 방 생성/참가/퇴장/추방/차단/이양은 SQL RPC가 멤버십과 방장 권한을 판단한다. 코드만 안다고 계정 권한이 생기지 않는다.
- **로비:** 최대 4명, 닉네임 최대 12자, 선택 동료·시간·Presence를 표시한다. 참가 상태는 DB, 현재 접속 표시는 Realtime이다. 기존 닉네임을 재접속 시 복원한다.
- **동시 타이머:** 방장이 현재 timer-state를 2초마다 broadcast한다. 참가자는 현재 leader ID와 형식 검사를 통과한 상태를 적용한다. 진행 중인 타이머의 deadline을 공유하며 서버의 초 단위 권위형 게임 시뮬레이션은 아니다.
- **재접속/권한:** 탭 sessionStorage에 재참가 정보만 저장한다. 20초마다 RPC로 자기 멤버십을 다시 확인한다. 추방/차단 후 DB·채널 경계를 우회할 수 없어야 한다.
- **채팅:** 120자, 화면의 최근 50개, 임시 broadcast이며 채팅 본문을 DB에 영구 저장하지 않는다. 클라이언트의 전송/수신 간격 제한은 서버 강제 rate limit과 다르다.
- **관계:** 함께 완주한 캠프 이력/동료, 이전 동료 초대, 지난 캠프를 새 방으로 열기. 초대 기본 만료는 7일이다.
- **신고:** `spam/harassment/privacy/other`만 보내며 자유 공부 내용·채팅 전문을 신고 레코드에 복제하지 않는다. 운영자는 상태/처리 시각만 갱신한다.
- **공유 금지:** 개인 목표, 퀘스트 제목, PDF, 회상 본문은 캠프 timer DTO에 포함하지 않는다.
- **신뢰 한계:** 멤버십 인증과 payload 무결성은 다르다. broadcast의 senderId는 종단 서명이 아니므로 신뢰된 방장 표시나 클라이언트 cooldown을 악성 참가자의 모든 위조/남용 방지로 설명하지 않는다.
- **수용:** 비멤버 채널 접근 차단, 방장/일반 참가자 권한 차이, A/B 타이머·채팅·재접속, 차단 재입장 거절, 공개 로그에 본문 없음.
- **근거:** [hook](../../app/hooks/useSilentCamp.ts), [DTO/검증](../../lib/silent-camp.ts), [로비](../../app/components/CampLobby.tsx), [멤버십](../../supabase/migrations/202611250001_secure_silent_camps.sql), [관계](../../supabase/migrations/202611250005_camp_relationships.sql), [최신 upsert](../../supabase/migrations/202611250008_fix_camp_upsert_targets.sql), [회귀](../../tests/silent-camp.test.mjs), [격리 E2E](../../e2e/staging.spec.ts).

## FQ-12 — PWA·오프라인·알림

- manifest와 정식 아이콘·설치 안내를 제공한다. 설치 UI는 브라우저별로 다르며 스토어 앱 출시와 다르다.
- 설치 이벤트는 Home의 단일 hook이 보관한다. native prompt는 사용자 클릭에서 한 번만 소비하고 취소/실패/미지원 시 기기별 설치 방법을 펼친다. iPad 데스크톱 모드도 iOS로 분류한다. 실제 설치 완료 표시는 appinstalled/standalone 신호에만 연결한다.
- Service Worker는 같은 origin의 정적 자산을 캐시하며 `/api`·외부 요청·`no-store/private` 응답을 저장하지 않는다. 새 Worker가 실행 중 집중 화면을 강제 새로고침하지 않는다.
- 네트워크 실패 시 개인정보 없는 정적 offline 화면에서 복구를 돕는다. 서버 계정/PDF/캠프를 완전 오프라인 편집하는 제품은 아니다.
- 앱 내 집중 종료 알림은 열린 앱의 세션 완료에 연결한다. **Web Push는 별도 출발 시간 리마인더**다. 앱이 닫힌 상태에서 모든 집중 타이머 종료를 보장하는 기능이 아니다.
- 사용자 동의 뒤 Push subscription을 Bearer 인증 API로 저장한다. Worker는 매분 최대 100개 due 구독을 조회한다. 404/410 구독은 제거, 나머지는 30분 후 재시도하고 실패 5회부터 비활성화한다. 성공 시 다음 due는 이전 due/현재 시각 중 늦은 시점 +24시간으로 설정하므로 DST의 정확한 현지시각 보장은 없다.
- **수용:** 거부/미지원이어도 타이머 사용 가능, 소유자만 구독 삭제, API 캐시 없음, 오프라인 전환 후 안전 복귀. [서비스 워커](../../public/service-worker.js), [Push API](../../app/api/push-subscriptions/route.ts), [발송](../../worker/index.ts), [도움 UI](../../app/components/InstallGuide.tsx), [회귀](../../tests/pwa.test.mjs), [Push 회귀](../../tests/push-reminders.test.mjs).

## FQ-13 — 제품 이벤트·Plus 관심도

- 이벤트는 로그인 사용자만 저장한다. 목표·회상·PDF 본문·채팅·이메일을 이벤트 payload에 붙이지 않는다. 손님 전체 트래픽의 전환율이 아니다.
- 7일 복귀는 같은 기기·계정의 마지막 방문 이후 신호다. 가입 코호트의 D7 유지율과 다르다. 저장소 키도 계정별로 분리한다.
- Plus는 구매가 아닌 관심 응답이다. 결제 요청·카드 수집·권한 판매를 하지 않는다.
- `ops:report`는 안정 정렬/페이지 순회로 내용을 제외한 집계를 출력한다. 표본이 적을 때 비율로 시장성을 확정하지 않는다.
- **수용:** 비로그인 집계 거절, A/B 전환에서 방문 신호 섞이지 않음, 이벤트 allowlist·크기 제한 유지, Plus가 결제로 표시되지 않음.
- **근거:** [telemetry hook](../../app/hooks/useProductTelemetry.ts), [계정 키](../../lib/telemetry-session.ts), [Plus hook](../../app/hooks/usePlusInterest.ts), [운영 집계](../../scripts/operations-report.mjs), [이벤트 허용 목록](../../supabase/migrations/202611250004_product_funnel_events.sql), [회귀](../../tests/operations.test.mjs).

## FQ-14 — 가입 확인·개인정보·계정 삭제

- 신규 이메일 가입은 만 14세 이상 자기 확인·개인정보 안내 확인·약관 동의를 받는다. 신원/연령 인증이나 법정대리인 동의 시스템은 아니다.
- 서버 Auth trigger가 문서 버전과 확인값을 검사하고 별도 변경 불가 acknowledgement를 남긴다. 수정 가능한 사용자 metadata를 관리자 권한으로 쓰지 않는다.
- 버전 변경은 UI 상수와 SQL trigger를 함께 설계해야 한다. 화면 문구만 바꾸고 신규 가입을 막는 불일치를 만들지 않는다. 과거 계정에 존재하지 않은 동의를 소급 생성하지 않는다.
- 계정 삭제는 명시 확인 문자열과 Bearer 사용자 확인을 요구한다. 소유자 Storage 객체 제거 후 Auth 삭제/DB cascade를 수행한다. 일부 파일이 먼저 삭제된 뒤 503이 날 수 있어 실패를 “변경 없음”으로 해석하지 않는다.
- 계정/자료 삭제는 삭제 대장을 만들고, 남은 PDF 정리 및 과거 백업 정리 성공 후 처리 표시한다. 다른 기기의 LocalStorage를 원격으로 즉시 지웠다고 안내하지 않는다.
- **수용:** 문서 확인 누락 직접 가입 거절, acknowledgement 사용자 수정 차단, 타인 ID로 계정 삭제 불가, 부분 실패 시 명시 오류, 개인정보/약관 링크가 입력·타이머를 보존.
- **근거:** [가입 metadata](../../lib/privacy.ts), [Auth UI](../../app/components/AuthDialog.tsx), [삭제 API](../../app/api/account/route.ts), [서버 확인/대장](../../supabase/migrations/202611250009_operating_policy.sql), [개인정보 페이지](../../app/privacy/page.tsx), [약관](../../app/terms/page.tsx), [문서 E2E](../../e2e/privacy.spec.ts).

## FQ-15 — 운영 집계·암호화 백업·보관 정리

- 새 전체 백업은 앱 18개 테이블·최소 계정 정보·연결 PDF를 포함한다. 비밀번호 해시/세션/MFA/OAuth 연결, PostgreSQL 물리 DB·PITR은 포함하지 않는다.
- DB 행은 RPC 읽기 snapshot이고 PDF 다운로드는 후속 작업이다. 참조 누락·다른 프로젝트·한도 초과는 실패 처리한다. 계속 변경 중인 시스템 전체의 단일 시점 복사라고 과장하지 않는다.
- AES-256-GCM, 객체별 nonce/AAD, 암호화 manifest, SHA-256/크기·목록 인증을 검증한다. Windows 키는 CurrentUser DPAPI 보호, 다른 환경은 외부 보호 키가 없으면 실패한다.
- 기본 `backup:daily`는 생성 전용. `--apply-retention`은 검증 후 만료/삭제 대상 사본 폐기, `--migrate-legacy`는 평문 검증·암호화 확인 후 원본 제거다. 둘 다 파괴적 승인 범위에서만 사용한다.
- 동시 실행 lock과 전체 사본 사전검증을 통과해야 정리한다. 실패한 사본을 건너뛰고 성공 처리하지 않는다. 만료 기준은 30일이며 다음 성공 실행에서 정리한다.
- Worker의 DB 만료 정리와 PC의 암호화 파일 정리는 다른 프로세스다. 외부 사본·독립 키 복구는 아직 없다.
- **수용:** 잘못된 키/수정·누락·목록 외 파일 거절, 손상 사본 발견 시 선행 삭제도 하지 않음, 동시 실행 거절/자기 lock 정리, 보호 범위 밖 삭제 거절, 민감 본문 미출력.
- **근거:** [일일 orchestration](../../scripts/daily-backup.mjs), [암호화 저장](../../scripts/encrypted-backup.mjs), [독립 검증](../../scripts/verify-encrypted-backups.mjs), [PDF 재처리](../../lib/cleanup-deleted-pdfs.ts), [회귀](../../tests/operating-policy.test.mjs), [정책](../OPERATING_POLICY.md), [런북](../OPERATIONS_RUNBOOK.md).

## FQ-16 — 검색 발견성과 운영자 통계

- 공개 sitemap/robots와 Open Graph·Twitter 기본 공유 정보를 제공한다. 별도 도메인 구매·검색 등록·색인·광고 심사는 자동 수행하지 않는다.
- 브랜드명은 `Focus Quest`, 한국어 대체 이름은 `포커스 퀘스트`다. 공개 홈의 검색·공유 제목은 `Focus Quest | 공부와 작업을 위한 포모도로 타이머`로 통일한다. 제목·설명은 [서비스 설정](../../lib/service-config.ts)을 기준으로 하며 설치 manifest 설명도 같은 문구를 유지한다.
- 홈은 계정 정보 없는 `WebSite` JSON-LD로 브랜드명·대체 이름·대표 URL을 제공한다. 개인정보/약관/운영자 페이지의 개별 제목과 기존 소유권 인증은 보존한다. 검색엔진의 제목 선택·색인 시점·순위는 보장하지 않는다.
- 홈페이지의 버그 신고·문의는 메일 링크가 아닌 메모창이다. 비로그인도 분류·내용·별도 보관 동의만으로 접수하며 운영자 계정 메뉴의 문의함에서 열람·처리 표시한다. 이메일 발송·사용자 답장·첨부 파일은 제공하지 않는다. 접수 후 90일 조회/보관, 일일 서버 정리, 학습 백업 제외를 안내한다. 일반 사용자는 자기 접수 번호로도 본문을 조회하지 못한다.
- 운영자 화면은 7/30일 이용자·집중 시작/완료/중단, 날짜와 동료별 건수를 제공한다. 서버 allowlist + 검증된 JWT가 필요하며 응답에 개별 계정 식별자·공부 내용이 없다.
- Cloudflare 방문 분석은 별도 사이트 식별자가 설정된 경우만 사용한다. 기본 꺼짐, 브라우저별 opt-in, DNT 존중, 깨끗한 공개 홈만 허용하며 인증 query/hash·운영자 페이지는 제외한다. 수집 오류가 타이머를 막지 않는다. 설정을 끄면 분석 중인 탭을 새로고침해 기존 코드도 중단한다.
- 기존 로그인 제품 이벤트는 별도의 운영 목적 기록이며 방문 분석 허용/거절과 혼동하지 않는다. 비로그인 이용을 로그인 퍼널로 계산하거나 마지막 방문 신호를 가입 코호트 D7으로 설명하지 않는다.
- **수용:** 무인증/일반 사용자 API 거절, 운영자 성공, no-store/noindex, 빈 데이터와 장애 상태, 390px 표 접근, 기본 외부 beacon 0건·허용 뒤 로드·콜백 URL 제외.
- **근거:** [계산·권한](../../lib/operations-dashboard.ts), [API](../../app/api/operations/route.ts), [화면](../../app/operations/OperationsDashboard.tsx), [선택형 분석](../../app/components/VisitAnalytics.tsx), [검색](../../lib/search-discovery.ts), [단위](../../tests/launch-analytics.test.mjs), [브라우저](../../e2e/launch.spec.ts).
