# API·이벤트 계약

## 경로 구분

일반 공개 서비스는 Supabase Auth/REST/RPC/Storage/Realtime와 Worker의 계정·Push API를 사용한다. 모든 데이터를 자체 REST API로 감싼 구조가 아니다. 아래 HTTP 계약의 기계 판독판은 [openapi.json](openapi.json)이다.

기존 계정·Push API는 JSON 응답, `Cache-Control:no-store`, `X-Request-Id`를 사용한다. 요청 ID는 추적용이며 인증이 아니다. account 응답 오류에는 `requestId`가 포함될 수 있지만 Push 오류 body는 `error`만 반환하므로 공통 필수 필드로 가정하지 않는다. 예제 토큰/URL은 실제 자격 증명이 아니다.

## GET /api/operations?days=7|30

- Supabase Bearer JWT를 `auth.getUser`로 검증한 뒤, 서버 전용 `FOCUS_QUEST_OPERATOR_USER_IDS`의 정확한 UUID 목록과 비교한다. 사용자 metadata·이메일·클라이언트 UI는 운영 권한 근거가 아니다.
- 무인증/만료 401, 비운영자/다른 Origin 403, 기간 오류 400, 서버 설정·조회 실패 503. `Cache-Control:no-store`, `Vary:Authorization`, `X-Robots-Tag:noindex,nofollow,noarchive`. 이 API는 별도 requestId 필드를 계약하지 않는다.
- 성공은 KST 달력 기준 최근 7/30일(오늘 포함)의 summary/daily/companions/period/generatedAt. 계정 ID·이메일·개별 원본 행은 반환하지 않는다.
- 로그인 사용자 이벤트만 조회한다. 시작/완료 건수는 개별 세션의 짝을 보증하지 않는다. 기존 summary 비율은 기간 내 고유 계정 비율이며 세션 완주율로 표시하지 않는다. `returned_after_7d`는 가입 기준 D7 지표가 아니다.
- 페이지당 500행, 최대 50,000행/20초 소프트 마감. 쿼리는 10초 timeout. 제한 도달 시 부분 결과를 완전한 통계로 반환하지 않는다.
- `/operations` HTML은 비밀 데이터를 포함하지 않는 클라이언트 shell이다. API에서 권한을 다시 검증하며 문서도 no-store/noindex로 처리한다.

## GET /api/visit-analytics

공개 설정 endpoint. `{enabled:false}` 또는 `{enabled:true,token:<public-site-id>}`만 반환한다. 32자리 hex 형식의 사이트 식별자는 의도적으로 공개되며 Cloudflare API 자격 증명이 아니다. 응답은 no-store/noindex. 관리자 키·운영자 UUID는 반환하지 않는다.

## POST /api/support, GET /api/support, PATCH /api/support

- POST는 비로그인도 사용하며 같은 Origin의 JSON만 받는다. 16KiB body 한도, UUID v4 재시도 키, `category=bug|suggestion|question`, 10~3,000자 `message`, `consent=true`, 현재 `noticeVersion`이 필요하다. 계정·이메일·자료는 수집하지 않는다. 성공 200 `{id,message}`이며 접수 본문을 돌려주지 않는다.
- 서버는 Cloudflare가 제공한 접속 IP를 서버 비밀키 HMAC과 UTC 날짜로 가명화한다. 원래 IP는 저장하지 않는다. 접수 RPC는 트랜잭션 잠금으로 동시 요청을 직렬화하고 같은 일 단위 식별값에 시간당 3건·일 10건, 전체 일 500건을 적용한다. 자정·공유 네트워크·서버 키 교체의 경계가 있는 남용 완화이며 완전한 봇 차단이나 비용 하드캡은 아니다.
- 동일 UUID·내용·식별값 재시도는 중복 저장하지 않는다. 키 충돌 409, 한도 429 + Retry-After, 입력 400/413, Origin 불일치 403, 서버 실패 503. 비밀값·DB 오류·다른 문의는 오류에 포함하지 않는다.
- GET/PATCH는 서버 검증 Supabase JWT + 기존 운영자 allowlist만 허용한다. 무인증/만료 401, 비운영자 403. GET `access=1`은 내용 없이 메뉴 노출 권한만, 일반 GET은 최신 50건과 `nextCursor`를 반환한다. cursor는 검증된 밀리초 ISO 시각/UUID 키셋이며 90일 이전 문의는 제외한다.
- PATCH `{id,status:open|closed}`는 상태·처리시각만 변경한다. 메시지 수정/삭제 API는 없다. 문의의 접수 번호는 조회 권한이 아니다. 모든 응답은 private/no-store/noindex다.
- `/operations/support`는 내용 없는 HTML shell이며 private/no-store/noindex다. 실제 문의는 권한 API가 반환하며 계정 전환·로그아웃 시 화면에서 제거한다. [구현](../../app/api/support/route.ts), [단위](../../tests/support-requests.test.mjs), [DB 역할 검증](../../supabase/tests/support_inbox_security.sql).

## GET /robots.txt, GET /sitemap.xml

기존 공개 origin만 사용한다. sitemap은 `/`, `/privacy`, `/terms`만 열거한다. robots는 `/api/`, `/operations`, `/auth/`를 제외한다. 검색 지시문은 인증이 아니며 검색엔진 등록·색인 승인을 보장하지 않는다.

## DELETE /api/account

- **인증:** `Authorization: Bearer <Supabase access token>`. 서버가 `auth.getUser(token)`으로 사용자 확인. body나 query의 userId를 받지 않는다.
- **Origin:** 있으면 요청 URL과 같아야 한다. Origin 부재를 허용하므로 이를 인증 경계로 삼지 않는다.
- **서버 설정:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. 없으면 404.
- **입력:** `{"confirmation":"delete-my-focus-quest-account"}`.
- **성공:** HTTP 200, `{"deleted":true}`.
- **순서:** 사용자 검증 → metadata 경로 + 소유자 prefix의 고아 객체 탐색 → 100개 단위 파일 제거 → Auth 계정 제거 → 관계형 cascade/삭제 대장.
- 탐색은 최대 5,000 entries, 페이지당 100개, 안전한 owner 경로만 허용한다.

| 상태 | 의미/클라이언트 행동 |
| --- | --- |
| 400 | JSON/확인 문자열 오류. 확인 없이 재요청하지 않음 |
| 401 | 토큰 없음/만료/검증 실패. 재인증 |
| 403 | 다른 Origin. 자동 우회 금지 |
| 404 | 서버 기능 미설정 |
| 503 | 목록/Storage/Auth 삭제 실패. requestId로 운영 확인, 부분 삭제 가능 |

**재시도:** 여러 서비스에 걸친 원자적 작업이 아니다. 503 뒤에도 파일이 일부 없어질 수 있다. 성공 뒤 같은 토큰 재요청은 더 이상 인증되지 않을 수 있다. 현재 기기의 캐시 제거와 타 기기 LocalStorage 제거를 동일시하지 않는다.

## POST /api/push-subscriptions

동일 Bearer/Origin 검사. 서버 설정이 없으면 503. 브라우저 구독과 다음 출발 시각을 저장한다.

```json
{
  "subscription": {
    "endpoint": "https://push.example.invalid/subscription",
    "keys": { "auth": "<browser-generated-auth>", "p256dh": "<browser-generated-p256dh>" }
  },
  "reminderTime": "09:00",
  "timezone": "Asia/Seoul",
  "nextDueAt": "2030-01-01T00:00:00.000Z"
}
```

위 키 placeholder는 길이 검증을 통과하는 실제 구독이 아니며 실행용 fixture가 아니다.

- endpoint: `https://` 시작, 20~2,048자. auth 8~80자, p256dh 40~180자.
- reminderTime: 24시간제 `HH:mm`. timezone 1~80자 문자열, nextDueAt은 Date.parse 가능 문자열. IANA timezone 전체 유효성을 API에서 증명하지 않는다.
- endpoint 기준 upsert, owner는 검증된 사용자로 설정. 성공 200 `{"saved":true}`.
- 400 입력/JSON 오류, 401 인증 실패, 403 Origin 불일치, 503 설정/DB 저장 실패.
- 저장 성공은 Push OS 전달 성공이 아니다. 개인 endpoint/구독키는 로그나 이슈에 출력하지 않는다.

## DELETE /api/push-subscriptions

- 동일 Bearer/Origin/설정 계약.
- 입력 `{"endpoint":"https://push.example.invalid/subscription"}`: 문자열, 최대 2,048자.
- 검증된 `user_id` **및** endpoint로 삭제한다. 타인 endpoint만 알아도 삭제할 수 없다.
- 성공 200 `{"deleted":true}`. 대상이 이미 없어도 같은 성공 응답. 400/401/403/503 의미는 위와 같다.

## 클라우드 저장 adapter — HTTP API와 혼동 금지

`CloudBackend.get/put/delete`는 내부 TypeScript interface다. 공개판의 구현은 Supabase JS 직접 요청이다.

| 메서드 | 입력 | 내부 결과 |
| --- | --- | --- |
| get | 인증 사용자 | `{status:200,body:{account,cloudState:null|{version,updatedAt,data}}}` |
| put | `baseVersion ≥ 0`, 검증된 CloudStateData v4 | 성공 200 + 새 cloudState, 경쟁 insert/CAS 실패 409 + 최신 cloudState |
| delete | 인증 사용자 | 본인 cloud-state 행만 삭제. 계정/과목/PDF 삭제 아님 |

Supabase 조회/저장 오류는 throw될 수 있고 hook이 UI 오류로 변환한다. `409`는 이 adapter가 정규화한 도메인 결과이며 PostgREST 응답을 그대로 중계한 것이 아니다.

## 사용자 RPC

입력 이름/형식의 최종 정의와 최신 교체 위치는 [소스 지도 SQL](SOURCE_MAP.md) 및 마이그레이션을 따른다. 호출은 로그인 JWT 필요, 인가 실패를 성공/빈 결과로 가정하지 않는다.

| RPC | 주요 인자 | 계약 |
| --- | --- | --- |
| `complete_study_quest_set` | `p_quest_id,p_session_id,p_duration_minutes` | 자기 퀘스트만. session ID 멱등 처리 |
| `save_study_quest_progress` | `p_quest_id,p_material_id,p_reached_page` | 소유 관계·자료/페이지 검증 |
| `create_focus_quest_camp` | `requested_code,requested_nickname,requested_adventure_id,requested_focus_minutes` | 서버에서 새 멤버십/방장 생성 |
| `join_focus_quest_camp` | 위 code/profile 인자 | 만료/차단/정원/기존 멤버 상태 검사 |
| `update_focus_quest_camp_member` | `requested_camp_id` + profile 인자 | 자기 활성 멤버 정보만 |
| `leave_focus_quest_camp` | `requested_camp_id` | 자기 퇴장, 방장 후속 처리 |
| `remove_focus_quest_camp_member` | `requested_camp_id,requested_user_id,should_block` | 방장 권한 검사 |
| `is_active_focus_quest_camp_member` | `requested_camp_id` | 호출자 자신만 확인. 과거 2인자 버전과 혼동 금지 |
| `record_focus_quest_camp_completion` | `requested_camp_id,requested_duration_minutes` | 자기 캠프 완주/관계 기록 |
| `invite_focus_quest_camp_contact` | `requested_camp_id,requested_contact_user_id` | 방장·기존 관계 확인 |
| `accept_focus_quest_camp_invitation` | `requested_camp_id` | 자기 초대 수락 |
| `report_focus_quest_camp_member` | `requested_camp_id,requested_user_id,requested_reason` | 제한된 사유, 자기 신고/중복 등 제약 |
| `reopen_focus_quest_camp` | `previous_camp_id` + code/profile 인자 | 과거 자기 이력 확인 후 새 방 |

## 서버 전용 RPC

`export_focus_quest_backup`, `focus_quest_operation_status`, `run_focus_quest_retention`, `focus_quest_pending_pdf_cleanup`, `acknowledge_focus_quest_pdf_cleanup(request_ids)`, `acknowledge_focus_quest_backup_cleanup(request_ids)`는 service_role 전용이다. 브라우저에 관리자 키를 주어 직접 호출하게 만들지 않는다. 원문은 [운영 정책 migration](../../supabase/migrations/202611250009_operating_policy.sql).

## Realtime 이벤트

채널 `focus-quest-camp:<camp UUID>`, `private:true`, 멤버십 정책 필요.

| 이벤트 | payload | 처리 |
| --- | --- | --- |
| Presence | memberId,joinedAt,nickname,adventureId,focusMinutes | 형식 검사·중복 제거 후 로비 표시 |
| timer-state | senderId,timer | 현재 방장 ID 비교 + SilentCampTimer 검증. 개인 목표/questId 제외 |
| camp-chat | id,senderId,nickname,body,sentAt | 멤버 목록·길이·간격 검사, 닉네임은 현재 멤버 값 사용 |
| member-removed | senderId,targetUserId | 로컬 퇴장 힌트. 실제 권한은 RPC/DB 멤버십 |

Broadcast는 저장 트랜잭션·감사 로그·서버 서명된 신원 증명이 아니다. 연결 끊김/재접속/메시지 손실을 처리해야 한다.

## 레거시 /api/cloud-state

`GET/PUT/DELETE`는 옛 ChatGPT Site + D1 adapter다. 현재 공개 Worker에는 DB binding이 없어 **404가 의도된 동작**이다. 이 경로를 200으로 만들려고 D1을 신규 생성하거나 Auth를 우회하지 않는다. 유지 호환 소스는 [route](../../app/api/cloud-state/route.ts), [D1 schema](../../db/schema.ts)다. PUT에는 `baseVersion,data`, 256,000-byte payload 제한과 CAS가 있다. 공개 Supabase adapter에 이 D1 전용 제한을 그대로 있다고 가정하지 않는다.
