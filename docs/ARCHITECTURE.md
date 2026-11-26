# Focus Quest 서비스 아키텍처

현재 구현 계약. 기능별 수용 기준은 [기술 인수인계](engineering/README.md), 제약은 [LIMITATIONS](engineering/LIMITATIONS.md)를 따른다.

## 1. 실행 구조

```text
브라우저
 ├─ React/Next App Router: 선택·준비·집중·완료·기록·캠프
 ├─ 순수 TypeScript: 시간 계산·병합·성장·문제·추천
 ├─ Phaser: 집중/완료/휴식 장면 (권한·완료 기록의 주체 아님)
 ├─ Web Audio / 지원 시 PiP / Service Worker
 └─ Supabase JS + 사용자 JWT
       ├─ Auth: 이메일 계정·재설정·선택 OAuth
       ├─ PostgREST/RPC: 개인 상태·학습·캠프 권한
       ├─ private Storage: PDF 원본
       └─ private Realtime: 멤버 현존·공유 타이머·임시 채팅

Cloudflare Worker (Vinext/Vite 빌드 + Static Assets)
 ├─ HTTP: 렌더링·계정 삭제·Push 구독 API·보안 헤더
 └─ Cron: 매분 출발 Push / 매일 UTC 18:00 보관 정리

운영 프로세스 (공개 HTTP 경로 아님)
 └─ 최소 권한 관리자 RPC → 암호화 로컬 백업·검증·삭제 대장 처리
```

공개판은 서버 Secret을 사용한다. 예전 “공개 Worker는 비밀키를 쓰지 않는다”는 설명은 현재의 계정 삭제·Push·보관 정리에 적용되지 않는다. 서버 키는 브라우저 번들에 포함하지 않는다.

## 2. 모듈 책임과 의존 방향

| 계층 | 파일 | 책임/금지 |
| --- | --- | --- |
| 화면 조합 | [app/page.tsx](../app/page.tsx) | 상태 전이·완료 순서·부수효과 연결. DB 인가의 근거로 쓰지 않음 |
| 표현 | [components](../app/components) | 폼·기록·장면 표현. Phaser가 집중 기록을 직접 확정하지 않음 |
| 외부 동기화 | [hooks](../app/hooks) | 인증·저장 큐·질의 상태·실패 표시 |
| 도메인 | [lib](../lib) | 주입 가능한 시간·직렬화·중복 제거·규칙. UI/Worker 환경에 불필요하게 결합하지 않음 |
| 서버 경계 | [routes](../app/api), [Worker](../worker/index.ts) | 검증된 Bearer 사용자, Secret, 로그 최소화, Cron |
| 영구 권한 | [migrations](../supabase/migrations) | RLS·grant·FK·RPC·trigger. 클라이언트 필터와 별개 |
| 운영 도구 | [scripts](../scripts) | 집계·검증·승인된 백업/정리. 일반 사용자 엔드포인트 아님 |

부작용은 hook/route/Worker/운영 도구에 모으고 계산은 lib에서 테스트한다. 현재 큰 Home 조합을 분리하려면 세션·클라우드·캠프 계약 단위로 단계적으로 한다. 이 문서는 대규모 구조 변경 승인이 아니다.

## 3. 상태와 저장

- 세션은 ActiveSession v1: absolute deadline(ms), paused seconds, startedAt, mode, 동료/음악/목표/선택 quest·원정.
- React의 250ms 갱신은 시간의 원천이 아니다. 복귀 후 deadline과 현재 시각 차이를 계산한다.
- 완료 ID는 시작시각+동료로 안정화해 새로고침·RPC 재시도를 중복 완주로 세지 않는다.
- CloudStateData v4와 서버 row revision은 서로 다른 버전이다. payload는 v1~v4를 읽고 v4로 정규화한다.
- JSON 상태는 설정·history·활성 세션·복귀·동료 성장. 과목/자료/퀴즈/캠프는 관계형 테이블이다.
- history 400개, 성장 원장 2,000개 상한이 있다. 영구 무제한 누적을 보장하지 않는다.

[필드·키·소유 관계](engineering/DATA_MODEL.md)와 [집중 기능](engineering/FEATURES_CORE.md)을 참조한다.

## 4. 계정·동기화 계약

1. 게스트는 해당 브라우저 저장으로 시작한다.
2. 로그인 시 로컬 owner 표식을 비교한다. 다른 계정 소유 데이터는 이관하지 않는다.
3. Supabase adapter가 자기 행을 읽고 version 조건부 저장한다. 최초 insert 경쟁과 수정 CAS 실패를 409 도메인 결과로 정규화한다.
4. 저장 큐를 직렬화하고 충돌은 최신 cloud와 병합 후 한 번 재시도한다.
5. 설정은 cloud 우선, history는 ID 기준, 회상은 savedAt, 세션/복귀는 각각 최신 변경시각 기준이다. null은 종료의 tombstone이 될 수 있다.
6. visible tab은 10초 주기와 화면 복귀에 pull한다. 다기기 즉시 lockstep 편집기는 아니다.
7. 최종 저장 실패 시 로그아웃을 중단한다. 성공 후 계정 소유 캐시를 비운다.

## 5. 학습·공동 집중 경계

- PDF.js는 브라우저에서 글자를 추출하지만 계정 PDF 원본과 퀴즈 소스는 Supabase에 저장한다. OCR·유료 AI 분석은 없다.
- Storage 업로드와 metadata insert, 파일 삭제와 Auth 삭제는 서로 다른 서비스 작업이다. 보상/재처리 경로는 있지만 원자 트랜잭션이 아니다.
- 세트 완료/학습 진척은 소유 관계를 검증하는 SQL RPC를 사용한다.
- 캠프는 DB 멤버십 + private Realtime이다. 개인 목표·자료·퀘스트는 공유 timer DTO에서 제외한다.
- 채팅은 임시 broadcast다. 멤버십 인증을 payload 서명·영구 감사·서버 rate limiting으로 확대 해석하지 않는다.

## 6. 인증·보안·관측

- 공개 Supabase 키는 노출 가능한 설정이며 RLS/FK/RPC/Storage가 데이터 경계다.
- Worker의 service_role/VAPID 개인키는 Secret 전용. metadata/초대 코드/요청 ID는 관리자 권한이 아니다.
- 신규 가입 확인은 Auth trigger와 읽기 전용 acknowledgement로 서버에 남긴다. UI 문서 버전과 trigger 버전을 함께 변경한다.
- API는 no-store·요청 ID, Worker는 CSP/HSTS/nosniff/iframe 금지 등 헤더를 적용한다. 현재 CSP의 inline 허용을 완전한 XSS 방어로 설명하지 않는다.
- 운영 오류 로그는 route/code/status/requestId/timestamp 등 제한된 필드만 남긴다. 학습 본문과 키는 남기지 않는다.
- 제품 이벤트는 로그인 사용자 중심의 제한 집계다. 전체 방문자나 유료 전환 지표가 아니다.

## 7. 배포·운영·호환

- 대표 서비스는 [service-config](../lib/service-config.ts), 운영 설정은 [wrangler.public.jsonc](../wrangler.public.jsonc).
- Next/React 소스를 Vinext/Vite로 Worker 대상으로 빌드한다. GitHub Pages 정적 export나 표준 Next 서버 배포로 간주하지 않는다.
- GitHub CI는 규칙·문서·린트·빌드·비밀값·렌더·브라우저, 별도 workflow는 격리 Supabase를 검증한다.
- Worker의 매일 UTC 18:00은 KST 다음 날 03:00이다. PC의 매일 21:00 암호화 백업 예약과 별개다.
- 외부 사본/독립 키 복구는 아직 미구성. 자동 사본 정리는 PC/Codex/CLI 인증에 의존한다.
- 기존 Sites 프로젝트 식별자와 hosting.json은 보존한다. 옛 ChatGPT/D1 API는 공개판에서 DB 미바인딩 404가 정상이다. 권한 오류를 숨기려고 공개판에 D1을 붙이지 않는다.
- 롤백은 현재 DB/가입 trigger와 호환되는 소스로만 한다. 과거 UI로 무조건 되돌리는 방법은 아니다.

[API](engineering/API_CONTRACTS.md) · [운영](OPERATIONS_RUNBOOK.md) · [검증](engineering/QUALITY.md)
