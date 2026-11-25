# Focus Quest 운영 런북

마지막 업데이트: 2026-11-25

## 대표 서비스와 배포 경계

- 정식 웹·PWA: https://focus-quest.hoya0328.workers.dev
- GitHub: https://github.com/hoya0328/focus-quest
- Cloudflare Worker: `focus-quest`, 설정 파일: `wrangler.public.jsonc`
- 기존 `.chatgpt.site`는 과거 주소다. 현재 Sites 연결 계정에 편집 권한이 없으므로 그 주소를 최신 버전으로 안내하지 않는다. 프로젝트 ID는 보존한다.
- 직전 검증 운영 버전: `fbbf931f-2178-4164-b303-8f54870fd664` (소스 `73ef065`). 장애 시 우선 롤백 후보이며 이전 UI에는 개인정보 경로가 없으므로 안내 링크의 영향도 함께 확인한다.
- 최종 배포: `83449a0e-65f6-412c-b3e3-0759fb80f9b0`, 검증 소스 `9cd41b103bd5fc4ba68cb5dfe317eea4e08308e5`. 일반 CI `45550010214`, 격리 계정 CI `45550010689`와 운영 HTTP·권한 점검을 통과했다. 후속 문서 커밋과 런타임 소스를 구분한다.
- 운영 정책 배포: 소스 `12c1a6360d806c930bb3056f88abc60b1a1076fb`, 버전 `65e634b4-91dd-4244-85e4-b1f5aede9adc`, CI `45585481667`/`45585482096` 통과. 이후 생성 전용 안전장치·승인 대기 고지를 추가했다. 최신 런타임 식별자는 인계 최신 항목을 따른다.
- 최종 생성 전용 안전장치·고지 배포: 소스 `46561b9efb3ef25ec8d296b263708a3d5339f39c`, 버전 `6eb30106-fb82-492f-9e79-7a568d40359a`, 일반 CI `45587526500` 통과. 직전 정책 버전과 서버 기능은 같으며 백업 삭제 승인 대기 상태를 안내한다.
- 마이그레이션009 이후 과거 UI로 롤백하면 신규 가입의 문서 버전/약관 확인이 맞지 않아 거부될 수 있다. 기존 로그인·게스트 타이머와 신규 가입 복구를 구분하고, 서버 확인을 우회하지 말고 호환 UI로 수정 배포한다. 스키마·확인 기록을 파괴적으로 되돌리지 않는다.

Cloudflare에서는 다음 순서로 버전을 확인하고 **실제 장애와 명시적 롤백 승인 후에만** 활성화한다.

```powershell
npx wrangler deployments list --config wrangler.public.jsonc
npx wrangler rollback fbbf931f-2178-4164-b303-8f54870fd664 --config wrangler.public.jsonc
npm run security:anonymous
```

롤백 확인을 이유로 정상 운영 버전을 실제로 되돌리지 않는다. 서버 전용 권한 복구 마이그레이션은 앱의 이전 버전과 호환되며 역방향 삭제를 하지 않는다.

## 운영 원칙

- 운영 데이터에서 파괴적 QA를 하지 않는다.
- 목표 문장, PDF 본문, 퀴즈 문항, Camp Log 자유 입력은 분석 로그에 남기지 않는다.
- 사용자 문의에는 요청 ID, 발생 시각, 화면 이름만 받는다. 계정 비밀번호·API 키·공부 자료는 받지 않는다.
- Supabase 관리자 키는 Cloudflare 암호화 Secret과 격리 E2E 러너에만 둔다.

## 매일 확인할 신호

1. Cloudflare Worker의 오류율과 `client_error` 증가
2. Supabase Auth·Storage·Realtime 상태와 프로젝트 활성 상태
3. `app_opened → focus_started → focus_completed → returned_after_7d` 전환
4. 버그 신고 메일과 재현 가능한 브라우저·화면 정보

제품 이벤트는 다음 집계처럼 본문 없이 확인한다.

```sql
select
  date_trunc('day', created_at) as day,
  event_name,
  count(*) as events,
  count(distinct user_id) as users
from public.focus_quest_product_events
where created_at >= now() - interval '30 days'
group by 1, 2
order by 1 desc, 2;
```

## 구조화 오류 로그

서버 오류는 `service`, `route`, `code`, `status`, `requestId`, `timestamp`만 기록한다. 사용자 ID, 이메일, 토큰, 요청 본문과 저장 데이터는 기록하지 않는다. 사용자가 오류를 신고하면 응답의 `X-Request-Id`로 Cloudflare 로그를 찾는다.

## 장애 등급

- **SEV-1:** 계정 간 데이터 노출, 비밀키 노출, 데이터 삭제 오작동. 즉시 신규 배포를 중단하고 관련 키·정책을 격리한다.
- **SEV-2:** 로그인, 동기화, 타이머 시작이 다수 사용자에게 실패. 30분 안에 이전 검증 버전으로 롤백을 판단한다.
- **SEV-3:** 특정 화면·브라우저의 비핵심 기능 실패. 핵심 타이머 우회 경로를 안내하고 다음 패치에 수정한다.

## 롤백

1. 현재 장애의 요청 ID와 발생 시각을 기록한다.
2. 마지막 통과 커밋과 현재 배포 커밋을 비교한다.
3. 위 Cloudflare Worker의 이전 성공 버전을 다시 활성화한다. Sites 권한 복구를 롤백 전제조건으로 삼지 않는다. 소스 이력은 강제로 되돌리지 않고 별도 revert 커밋을 만든다.
4. 데이터베이스 마이그레이션은 역방향 삭제를 실행하지 않는다. 호환 가능한 후속 마이그레이션으로 복구한다.
5. 게스트 타이머, 로그인, 저장, 모바일 화면을 확인한 뒤 장애 종료를 선언한다.

## 백업과 복구

- 파괴적 스키마 변경 전에는 Supabase 백업 가용성을 확인하고, 무료 플랜에서 백업이 없다면 SQL·Storage 내보내기 계획을 먼저 만든다.
- PDF와 사용자 계정 삭제는 되돌릴 수 없다. 운영 계정으로 삭제 QA를 하지 않는다.
- 로컬 게스트 기록은 브라우저 저장소에만 있으므로 브라우저 데이터 삭제 후 서버에서 복구되지 않는다.

최신 기준은 [OPERATING_POLICY.md](OPERATING_POLICY.md)를 따른다. 관리자 키는 기존 Supabase CLI에서 메모리로만 받아 사용하며 브라우저·빌드에 넣지 않는다.

```bash
npm run backup:daily
npm run ops:report
npm run camp:moderate -- <report-id> reviewed
```

- 새 백업은 앱18개 테이블·최소 계정 식별 정보·연결 PDF를 AES-256-GCM으로 암호화하고 각 객체·목록의 무결성을 검증한다. `backups/`와 DPAPI 보호 키는 Git 제외·현재 사용자 전용 ACL이다.
- 새 전체 사본 검증 후 기존 평문17개 테이블 내보내기를 검증·암호화 전환하고 원래 평문 폴더만 제거한다. 과거17테이블 검증 도구는 격리 회귀·이관에만 사용하며 새 운영 평문 내보내기는 차단했다.
- 생성 후30일 사본과 삭제 대장에 해당하는 과거 사본을 정리하는 코드는 있으나, 현재 예약은 생성 전용이다. 원본 정리·자동 삭제에 대한 구체적 승인 후에만 `--migrate-legacy`/`--apply-retention`을 사용한다. PC/Codex/CLI 인증에 의존하며 매일 실행 결과·미처리 삭제 건수를 확인한다.
- R2 미활성화로 외부 보관은 아직 안 된다. 결제수단 등록이나 과금 승인 없이 활성화 가능할 때만 진행한다. PC 손실 시 키를 복구할 별도 보관 수단도 미완료다.
- 스키마·비밀번호·토큰·MFA·OAuth 연결의 완전한 복구를 보장하지 않는다. DB 행의 단일 읽기 시점과 후속 PDF 다운로드는 다르며 참조 파일이 빠지면 실패한다. 실제 운영 복원은 별도 승인, 격리 검증과 사용자 인증 재설정 안내가 필요하다.
- 기존 주간 예약을 매일21:00 KST 암호화 백업 생성·검증으로 갱신했다. 현재 자동 삭제는 비활성이다. PC와 Codex가 실행 중이고 Supabase CLI 인증·보호 폴더 실행 권한이 필요하다.
- `ops:report`는 전환 수와 신고 상태만 집계하며 사용자 ID, 학습 내용, 채팅 본문을 출력하지 않는다.
- 현재 자동 경고는 시작 사용자 5명 이상일 때 완주 비율 65% 미만, 이벤트 20개 이상일 때 client_error 비중 2% 초과에만 발생한다. 첫 시작·D7 유지율과 신고량의 추가 임계값은 표본과 측정 모수를 검증한 뒤 정한다.

현재 계정으로 승인된 Supabase CLI가 있으면 키를 파일에 복사하지 않고 메모리에서만 연결해 실행할 수 있다.

```powershell
node --env-file=.env.local scripts/run-linked-operations.mjs inspect
node --env-file=.env.local scripts/run-linked-operations.mjs report --days=30
npm run backup:daily
node --env-file=.env.local scripts/run-linked-operations.mjs maintenance
```

- 집계는 로그인 사용자만 포함한다. 기간 내 고유 사용자 비율이지 전체 방문자 전환율이나 코호트 D7 유지율이 아니다.
- `maintenance --run-retention`은 승인된 만료 정리만 실행한다. 서버는 매일03:00 KST 같은 RPC를 실행한다. 익명·일반 사용자에게 실행 권한이 없다.
- `returned_after_7d`는 이 기기·계정에서 7일 이상 지난 복귀 신호다. 첫 방문 오집계 수정 전 이벤트는 유지율 근거로 쓰지 않는다.
- 기준치는 아직 제품 가설이다. 표본이 충분하지 않으면 수치로 성과를 판정하지 않는다.

## 사용자 피드백

첫 화면의 `버그 신고 · 문의` 링크는 `letshoya@naver.com`으로 연결한다. 공개 이슈에는 보안 취약점·개인 기록·재현용 토큰을 올리지 않고, 보안 문제는 GitHub Security Advisory를 사용한다.
