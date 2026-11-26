# Focus Quest 운영 런북

현재 기술 절차 문서다. 실제 실행 이력·승인 기록·키·사용자 데이터는 이 문서나 공개 GitHub에 추가하지 않는다. 배포 후보 SHA/사업자 버전·최근 성공 시각은 승인된 비공개 운영 기록에서 확인한다. 과거 날짜별 HANDOFF의 수치를 현재 상태로 간주하지 않는다.

## 1. 환경과 운영 권한

- 공개 웹/PWA: [Focus Quest](https://focus-quest.hoya0328.workers.dev), Worker 설정 [wrangler.public.jsonc](../wrangler.public.jsonc).
- [API 계약](engineering/API_CONTRACTS.md), [권한](engineering/DATA_MODEL.md), [보관 정책](OPERATING_POLICY.md)을 먼저 읽는다.
- 브라우저는 공개키+사용자 JWT, 서버는 Secret/업무 grant/RPC를 사용한다. 운영 키를 개발 편의를 위해 클라이언트로 옮기지 않는다.
- 과금·계정 초대·권한 변경·키 교체·파괴적 작업·운영 복원은 해당 범위 승인이 필요하다.
- 역할은 개발(수정/회귀), QA(실제 사용자·기기 확인), 운영(배포/백업/알림), 개인정보 담당(문의/삭제 확인)으로 구분한다. 실제 담당자/긴급 연락은 비공개로 지정한다.

## 2. 일상 점검

1. 홈·개인정보·약관 응답, 인증 없는 API 거절과 보안 헤더.
2. 오류 requestId로 한정한 Worker 상태·개인정보 없는 제품 집계.
3. 최근 DB 보관 정리 성공과 미처리 백업 삭제 건수.
4. 최신 암호화 백업의 전체 검증, 예약 작업의 최근 성공·PC/CLI 인증 상태.
5. 실제 비용/메일 발송 한도/실패 구독/미처리 신고/문의 기한.

```bash
npm run security:anonymous
node --env-file=.env.local scripts/run-linked-operations.mjs maintenance
npm run backup:verify:encrypted
```

위 명령도 네트워크·보호 폴더 접근 승인이 필요할 수 있다. maintenance 조회는 상태 확인이며 보관 삭제 실행으로 간주하지 않는다. 출력/이슈에는 사용자 ID·본문·키 대신 개수·상태·requestId만 남긴다.

## 3. 스케줄을 구분한다

| 실행 | 주기 | 책임과 실패 영향 |
| --- | --- | --- |
| Cloudflare Cron | 매분 | 최대 100개 due 출발 Push. 404/410 폐기, 반복 실패 비활성화 |
| Cloudflare Cron | UTC 18:00 = 다음 날 KST 03:00 | 삭제 PDF 재처리 후 DB 보관 정리 RPC. 실패를 완료로 기록하지 않음 |
| 로컬 예약 | KST 매일 21:00 | 암호화 백업 생성·검증 후 승인된 사본 정리. PC/Codex/CLI 인증 필요 |

앱이 닫힌 뒤의 출발 Push와 집중 세션 종료 알림은 다르다. Worker Cron 정상만으로 PC 백업이나 실제 OS 알림 수신이 성공했다고 말하지 않는다.

## 4. 암호화 백업

```bash
npm run backup:daily
npm run backup:verify:encrypted
```

기본 명령은 생성 전용이다. 관리자 RPC의 앱 18개 테이블·최소 계정 정보와 연결 PDF를 암호화한다. Windows는 CurrentUser DPAPI, 기타 환경은 외부 보호 키가 필요하다. 백업과 키는 Git 제외·사용자 전용 폴더에 둔다. 스키마·인증 비밀번호/세션/MFA/OAuth·DB 물리 상태 전체 백업이 아니다.

승인된 정기 사본 정리는 다음 **별도 파괴적 모드**다.

```bash
npm run backup:daily -- --apply-retention
```

- 기존 사본/프로젝트/키와 새 사본 무결성 검증 후 만료 30일 또는 삭제 대장 정보가 포함된 과거 사본을 전체 폐기한다.
- 현재 보관 정책은 이 정기 정리 모드를 사용한다. 기본 생성 명령만 실행하고 삭제 요청 처리가 끝났다고 판단하지 않는다.
- 평문 전환 `--migrate-legacy`는 매일 넣는 옵션이 아니다. 정확한 기존 원본 목록과 승인 확인, 새 전체 백업 검증, 각 원본 checksum/암호화/복호화 검증 후에만 원본을 제거한다.
- 사본 손상/누락/목록 외 파일/혼합 프로젝트/보호 키 분실 시 중단한다. 통과한 사본만 먼저 삭제하거나 임의 대체 키를 만들지 않는다.
- lock이 남으면 실제 PID와 실행 상황을 확인한다. 다른 작업의 lock이나 백업 폴더를 일괄 삭제하지 않는다.
- 외부 사본과 독립 키 복구는 아직 없다. R2가 결제수단/계약/과금 승인을 요구하면 진행하지 않는다.

## 5. 삭제 요청과 문의

- 계정 삭제 API는 Storage를 먼저 지우므로 실패 응답 뒤에도 부분 변경이 있을 수 있다. 인증 사용자와 소유 경로를 확인하고 재시도한다.
- 자료 삭제 대장의 미처리 PDF는 Storage API로 제거한 뒤 확인 표시한다. 파일 metadata만 SQL로 지우지 않는다.
- 사본 정리 확인 전 삭제 완료·운영 복원 가능으로 안내하지 않는다. 타 기기 LocalStorage 예외도 설명한다.
- 문의는 최소 계정 이메일/오류 화면/시각/requestId로 접수한다. 비밀번호·인증 링크·학습 원본을 요구하지 않는다.
- 첫 답변 3영업일 목표, 법정 기한 우선. 처리 완료 메일/첨부는 정책의 90일 기준으로 수동 정리하며 자동 메일함 삭제를 제공하지 않는다.
- 미처리 삭제/신고는 단순 보관기한 경과만으로 없애지 않는다.

신고 상태 처리 도구:

```bash
npm run camp:moderate -- REPORT_ID reviewed
```

실제 report ID와 서버 환경을 확인한 승인된 담당자만 실행한다. 공개 저장소에 신고 당사자/사유 본문을 붙이지 않는다.

## 6. 장애 대응

| 유형 | 우선 조치 |
| --- | --- |
| 데이터 노출/권한 우회 의심 | 증거 최소 보존, 영향 기능/모집 축소 판단, 자격 증명 노출 여부 확인. 임의 로그·키 공개 금지 |
| 로그인/저장/타이머 다수 실패 | requestId·배포/마이그레이션 경계 확인, 호환 이전 버전 또는 수정 배포 판단 |
| 알림/오디오/특정 기기 오류 | 핵심 집중 경로와 분리, 지원/미지원 안내, 실기기 재현 |
| 백업/사본 삭제 실패 | 성공 처리 중단, PC/인증/lock/키/사본 손상 구분. 삭제 요청 기한 확인 |

로그 기준은 [server-observability](../lib/server-observability.ts). route/code/status/requestId/timestamp 외 사용자 본문을 원인 진단용으로 무제한 추가하지 않는다.

## 7. 배포와 롤백

1. Git 상태·해당 소스 SHA·필요 migration 적용·일반/격리 검사 결과를 확인한다.
2. 검증한 정확한 소스를 기존 승인 Git 원격에 반영한다. 명세 정리 요청만으로 외부 push/배포까지 허용됐다고 가정하지 않는다.
3. 현재 승인된 배포 경로를 사용한다. Sites를 쓸 경우 원래 hosting.json ID를 유지하며 NOT_FOUND를 새 프로젝트 생성/접근 공개로 우회하지 않는다. 기존 공개 Worker 대상 배포와 구분한다.
4. 배포 후 HTTP/정책/헤더/인증 거절·핵심 흐름 smoke, 스케줄 유지와 오류 확인.
5. 실제 장애+롤백 승인 시 이전 **호환** 버전을 선택한다.

```bash
npx wrangler deployments list --config wrangler.public.jsonc
npx wrangler versions list --config wrangler.public.jsonc
npx wrangler rollback COMPATIBLE_VERSION_ID --config wrangler.public.jsonc
```

`COMPATIBLE_VERSION_ID`는 비공개 검증 기록과 사업자 목록을 대조해 교체한다. 오래된 UI는 현재 신규 가입 확인 버전과 달라 가입 실패를 만들 수 있다. Auth trigger를 느슨하게 하거나 schema/data를 파괴적으로 되돌리는 우회는 금지한다. 정상 운영 중 롤백 훈련을 실행하지 않는다.

## 8. 복원·종료

실제 운영 복원은 자동화하지 않는다. 별도 승인 → 삭제 대장/사본 정리 확인 → 격리 환경에서 복호화·관계·소유자 접근·PDF 검증 → 계정 본인 확인/비밀번호 재설정 계획 → 사용자 안내 → 운영 적용 순서다. 현재 검증 도구는 운영 Auth 전체 복원기를 제공하지 않는다.

계획된 서비스 종료는 정책의 30일 전 안내, 데이터 내보내기/삭제 요청, 운영 자료·사본·키의 안전한 폐기 순서를 정한다. 법정 보존 예외는 전문 검토가 필요하다.
