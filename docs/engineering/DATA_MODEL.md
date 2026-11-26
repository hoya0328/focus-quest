# 데이터·권한 명세

## 기준과 단위

스키마의 원본은 [Supabase 마이그레이션](../../supabase/migrations)이다. 파일명 순서대로 누적 적용한 최종 스키마를 사용한다. 같은 함수는 뒤 migration에서 교체될 수 있다. [자동 소스 지도](SOURCE_MAP.md)는 모든 테이블 생성 위치와 함수의 마지막 정의 위치를 제공한다. `db/schema.ts`의 SQLite 모델은 옛 D1 호환용이며 공개판 PostgreSQL 스키마 생성 원본이 아니다.

- UUID: 소유자/관계 식별자. `user_id`는 보통 `auth.users.id` cascade 참조다.
- `*_at`: PostgreSQL timestamptz/ISO, 화면 날짜 묶음은 기기 로컬 날짜. `target_date`는 시간 없는 date다.
- 분/초/밀리초를 구분한다. `file_size_bytes`는 byte, MiB는 1,048,576byte다.
- 22개 앱 public 테이블 중 학습·계정 백업 대상은 18개다. 삭제 대장/실행 상태/파생 quota와 단기 문의 메모는 동일한 복구 대상 집합으로 다루지 않는다.

## 관계

```text
auth.users
 ├─ cloud_states (1:1 JSON 상태)
 ├─ study_subjects ─┬─ study_quests ─┬─ study_quest_focus_sessions
 │                 │               ├─ study_quest_progress
 │                 │               └─ study_quiz_attempts
 │                 └─ study_materials ── private Storage source.pdf
 ├─ camps ↔ camp_members / camp_blocks
 ├─ camp_history / camp_contacts / camp_invitations / camp_reports
 ├─ push_subscriptions / product_events / plus_interest
 └─ account_acknowledgements
deletion_ledger → PDF bytes cleanup → encrypted archive cleanup → processed_at
```

화살표는 소유/연관 개념도다. 정확한 복합 FK·삭제 동작은 아래와 SQL을 따른다. SQL이 아닌 화면 배열에만 있는 관계를 실제 FK라고 주장하지 않는다.

## 테이블 사전

이 표의 `focus_quest_` 접두사는 축약하지 않는다. 필수/null/default/전체 check 목록은 연결된 원문과 DTO를 함께 본다.

| 테이블 | 키·주요 필드 | 접근·생명주기 |
| --- | --- | --- |
| `focus_quest_cloud_states` | PK user_id, version≥1, payload JSONB, updated_at | 본인 CRUD. CAS 버전은 서버 저장 revision, payload schemaVersion과 다름 |
| `study_subjects` | PK id, user_id, name,goal,target_date,weekly_minutes,created/updated_at | 본인 CRUD, `(id,user_id)` unique. 삭제 시 과목 관계 cascade |
| `study_quests` | PK id, subject_id,user_id,title,objective,status,adventure_id,focus/break_minutes,target/completed_sets,material_id,source_pages,study_method,estimated_minutes_min/max,quest_contract,completed_at | 본인 CRUD + 소유 과목 복합 FK. 자료 삭제 시 material 연결 해제, 다른 연관 진척은 해당 FK 정책 적용 |
| `study_quest_focus_sessions` | PK session_id, user_id,quest_id,duration_minutes,completed_at | 본인 CRUD/RPC. 세트 중복 방지 키, 소유 퀘스트 FK |
| `study_materials` | PK id, user_id,subject_id,file_name,storage_path(unique),file_size_bytes,page_count,status,summary,analysis,analysis_provider,error_message,analyzed_at | 본인 CRUD, 원본 bytes는 Storage 별도. 현재 analysis는 `focus-quiz-source-v1` |
| `study_quest_progress` | PK quest_id, user_id,material_id,last_reached_page,updated_at | 본인 CRUD/RPC, 소유 퀘스트·자료 복합 FK |
| `study_quiz_attempts` | PK id, user_id,quest_id,material_id,session_key,stage,quiz_key,range_start/end,reached_page,selected_index,is_correct,skipped,created_at | 본인 CRUD. `(user_id,session_key,stage)` unique. skip이면 응답/정오는 null |
| `focus_quest_product_events` | PK id, user_id,event_name,adventure_id,duration_minutes,quest_id,outcome,error_code,created_at | 본인 select/insert/delete, event/outcome allowlist. 생성 후 90일 정리 |
| `focus_quest_plus_interest` | PK user_id, interest_level(interested/not_now),price_band(4900/5900/6900 또는 null),updated_at | 본인 CRUD. not_now이면 price_band=null. 마지막 갱신 후 90일 |
| `focus_quest_camps` | PK id, code unique,leader_user_id,created_at,closed_at | 활성 멤버 read, 쓰기는 권한 RPC |
| `focus_quest_camp_members` | PK (camp_id,user_id), nickname,adventure_id,focus_minutes,joined_at,left_at | 활성 멤버 read, 자기 프로필/퇴장/방장 조치는 RPC |
| `focus_quest_camp_blocks` | PK (camp_id,user_id), blocked_by,created_at | 일반 직접 접근 없음, 방장 RPC로 반영 |
| `focus_quest_camp_history` | PK (camp_id,user_id), camp_code,nickname,adventure_id,duration_minutes,member_count,completed_at | 자기 read, 완주 RPC. 채팅 전문 없음 |
| `focus_quest_camp_contacts` | PK (user_id,contact_user_id),nickname,adventure_id,sessions_together,last_camp_id,last_met_at | 자기 read, 관계 RPC. 자기 자신 관계 금지 |
| `focus_quest_camp_invitations` | PK (camp_id,invitee_user_id), inviter_user_id,inviter_nickname,camp_code,created/expires/accepted_at | 초대자/수신자 read, RPC 변경. 만료 후 30일 정리 |
| `focus_quest_camp_reports` | PK id, camp_id,reporter/reported_user_id,reason,status,created/reviewed_at | 직접 사용자 read/write 없음. 제한 신고 RPC, 서버 상태 처리. 완료 후 90일 |
| `focus_quest_push_subscriptions` | PK id, endpoint unique,user_id,p256dh,auth,reminder_time,timezone,next_due_at,enabled,failed_attempts,last_sent_at | 본인 read/delete, 생성/갱신은 서버 API. 구독키도 개인정보 취급 |
| `focus_quest_account_acknowledgements` | PK user_id,privacy_version,terms_version,age_over_14_declared,acknowledged_at | 본인 read만. Auth trigger 기록, 사용자 수정 금지 |
| `focus_quest_deletion_ledger` | PK id, kind,target_id,owner_id,storage_deleted_at,created_at,processed_at; unique(kind,target_id) | 서버 RPC/trigger 전용. 처리 확인+생성 후 35일 정리, 미처리 보존 |
| `focus_quest_operation_runs` | PK operation,completed_at,counts JSONB | 서버 RPC 전용. 민감 본문 없는 최근 운영 결과 |
| `focus_quest_pdf_quotas` | PK user_id,object_count≥0 | Storage trigger 전용 파생값. 백업에서 덮어쓸 사용자 원장 아님 |
| `focus_quest_support_requests` | PK id,category,message,status,created/reviewed_at,rate_key,notice_version | 일반 역할 직접 접근 없음. Worker가 접수 RPC/운영자 JWT 검증. 90일 보관, 학습 백업 제외. 원래 IP·이메일·계정 ID 미저장 |

원문: [기본 클라우드](../../supabase/migrations/202607260001_focus_quest_cloud_states.sql), [과목/퀘스트](../../supabase/migrations/202607260002_study_quests.sql), [PDF](../../supabase/migrations/202607280001_study_materials.sql), [학습 진척](../../supabase/migrations/202611130001_product_readiness.sql), [Plus](../../supabase/migrations/202611240003_plus_interest_research.sql), [캠프](../../supabase/migrations/202611250001_secure_silent_camps.sql), [관계](../../supabase/migrations/202611250005_camp_relationships.sql), [Push](../../supabase/migrations/202611250002_web_push_reminders.sql), [운영 데이터](../../supabase/migrations/202611250009_operating_policy.sql).

## 브라우저 상태 사전

| 값 | 저장/상한 | 계약 |
| --- | --- | --- |
| ActiveSession v1 | `haru-focus-active-session` | focus/break, deadline(ms), paused snapshot(seconds), 목표·원정·선택 quest |
| FocusRecord[] | `haru-focus-history`, 최신 400 | 세션 ID 중복 제거. 완료만 포함 |
| CloudStateData v4 | 본인 cloud-state payload | preferences/history/activeSession/sessionUpdatedAt/recoveryQuest/recoveryUpdatedAt/companionGrowth |
| companionGrowth | `focus-quest-companion-growth`, 최신 2,000 | sessionId/adventureId/minutes/completedAt. 무제한 lifetime 집계 아님 |
| 소유자 표식 | `focus-quest-cloud-local-owner` | 계정 간 로컬 병합 차단. 인증 수단 아님 |
| 회복 퀘스트 | `focus-quest-recovery`, 7일 | 만료/손상 시 재사용하지 않음 |
| 도달 페이지 | `focus-quest-reached-page:<questId>` | UI 보조, 서버 ownership/RPC를 대체하지 않음 |
| 캠프 복구 | sessionStorage | code/memberId/joinedAt. JWT·멤버십을 대체하지 않음 |
| 딴생각·목표·음량/시간 설정 | LocalStorage | 브라우저 데이터 삭제 시 사라질 수 있음. 모든 항목이 클라우드에 동기화되지는 않음 |

LocalStorage는 XSS나 동일 OS 계정의 접근에 대한 암호화 저장소가 아니다. 비밀번호·서버 키를 여기에 저장하지 않는다. Supabase SDK 세션 관리와 앱 상태의 소유권 표식을 구분한다.

## 권한 행렬과 원칙

| 주체 | 개인 데이터 | 캠프 | 운영 데이터 |
| --- | --- | --- | --- |
| 비로그인/공개키 단독 | 앱 데이터 접근 불가 | 생성·참가·비공개 채널 불가 | 불가 |
| 소유자 A | 자기 행·Storage 경로만 | 자기 활성 멤버십 범위 | 자기 가입 확인 read만 |
| 다른 계정 B | A 데이터 불가, FK로 우회 연결도 불가 | 같은 방의 허용된 표시 정보만 | 불가 |
| 방장 | 개인 학습 자료에 추가 권한 없음 | 자기 방의 권한 RPC | 신고 운영 처리는 불가 |
| service_role 서버 | 업무에 필요한 명시 grant/RPC | 서버 업무용 | 제한된 export/status/cleanup RPC |

service_role은 RLS 우회 능력이 있지만 SQL 객체 권한까지 자동으로 보장하는 것은 아니다. [서버 읽기](../../supabase/migrations/202611250006_operations_read_access.sql), [서버 쓰기](../../supabase/migrations/202611250007_operations_write_access.sql)의 범위를 유지한다. 새로운 테이블을 만들 때 `grant all`로 해결하지 말고 최소 역할·동작을 정한다. 사용자 metadata·캠프 code·x-request-id는 관리자 권한 경계가 아니다.

## 변경과 삭제

- 새 기능은 기존 적용 migration을 덮어쓰지 않고 후속 migration을 추가한다. 인덱스/백필/호환 UI/권한/롤백을 함께 설계한다.
- 파괴적 schema 변경, 운영 권한 추가, 운영 복원·키 교체는 별도 승인 대상이다.
- Storage bytes는 Storage API로 삭제한다. `storage.objects` 행만 SQL로 지워 파일 삭제를 가장하지 않는다.
- DB cascade와 Storage 파일 정리는 별개다. 삭제 대장을 확인하고 미처리를 완료로 보고하지 않는다.
- 문서 동의 버전은 [privacy 상수](../../lib/privacy.ts), [정책 상수](../../lib/operating-policy.ts), Auth trigger가 함께 맞아야 한다.
