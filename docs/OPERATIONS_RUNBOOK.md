# Focus Quest 운영 런북

마지막 업데이트: 2026-11-25

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
3. Cloudflare/Sites의 이전 성공 버전을 다시 활성화한다. 소스 이력은 강제로 되돌리지 않고 별도 revert 커밋을 만든다.
4. 데이터베이스 마이그레이션은 역방향 삭제를 실행하지 않는다. 호환 가능한 후속 마이그레이션으로 복구한다.
5. 게스트 타이머, 로그인, 저장, 모바일 화면을 확인한 뒤 장애 종료를 선언한다.

## 백업과 복구

- 파괴적 스키마 변경 전에는 Supabase 백업 가용성을 확인하고, 무료 플랜에서 백업이 없다면 SQL·Storage 내보내기 계획을 먼저 만든다.
- PDF와 사용자 계정 삭제는 되돌릴 수 없다. 운영 계정으로 삭제 QA를 하지 않는다.
- 로컬 게스트 기록은 브라우저 저장소에만 있으므로 브라우저 데이터 삭제 후 서버에서 복구되지 않는다.

운영용 자격 증명은 Git에서 제외된 `.env.operations.local`에만 둔다. 다음 명령은 관리자 키를 브라우저나 빌드에 포함하지 않는다.

```bash
npm run backup:create
npm run backup:verify -- backups/<manifest-file>.json
npm run ops:report
npm run camp:moderate -- <report-id> reviewed
```

- 백업은 개인 테이블의 JSON 스냅샷, 행 수와 SHA-256을 `backups/`에 저장하며 이 폴더는 Git에서 제외된다.
- `backup:verify`는 체크섬과 행 수만 검사한다. 운영 복원은 파괴적 작업이므로 자동 실행하지 않는다.
- 비공개 PDF 원본은 이 스크립트에 포함되지 않는다. Storage 내보내기는 별도의 보호된 저장소와 보존 정책을 정한 뒤 실행한다.
- `ops:report`는 전환 수와 신고 상태만 집계하며 사용자 ID, 학습 내용, 채팅 본문을 출력하지 않는다.
- 앱 열기 대비 집중 시작률 35% 미만, 집중 완주율 55% 미만, 7일 복귀율 15% 미만, 미처리 신고 5건 이상이면 운영 확인 신호로 표시한다.

## 사용자 피드백

첫 화면의 `버그 신고 · 문의` 링크는 `letshoya@naver.com`으로 연결한다. 공개 이슈에는 보안 취약점·개인 기록·재현용 토큰을 올리지 않고, 보안 문제는 GitHub Security Advisory를 사용한다.
