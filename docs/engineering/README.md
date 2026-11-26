# Focus Quest 기술 인수인계

이 문서 묶음은 현재 코드의 계약을 설명한다. 과거 기획안, 실행 일지, 성과 보고서와 구분한다. 비밀키·운영 사용자 데이터·개인 작업 명령 체계는 포함하지 않는다.

## 읽는 순서

| 독자/목적 | 먼저 읽을 문서 |
| --- | --- |
| 새 개발자: 실행하고 첫 변경 만들기 | [개발 시작 안내](ONBOARDING.md) → [아키텍처](../ARCHITECTURE.md) → [소스 지도](SOURCE_MAP.md) |
| PM/QA: 실제 기능과 완료 조건 확인 | [집중·성장](FEATURES_CORE.md) → [학습](FEATURES_LEARNING.md) → [공동 집중·운영 기능](FEATURES_PLATFORM.md) |
| 서버/데이터 담당: 권한과 연동 수정 | [API 계약](API_CONTRACTS.md) · [OpenAPI](openapi.json) · [데이터·권한 명세](DATA_MODEL.md) |
| 유지보수 담당: 검증·배포·장애 대응 | [검증 기준](QUALITY.md) → [운영 런북](../OPERATIONS_RUNBOOK.md) |
| 출시 판단 담당 | [남은 확인 사항](LIMITATIONS.md) · [실사용자 테스트 계획](../BETA_TEST_PLAN.md) |

## 문서의 우선순위

1. 동작의 근거는 소스, SQL 마이그레이션, 자동 테스트다. 문서와 충돌하면 문서를 수정하고 필요 시 테스트를 추가한다.
2. 현재 구현 계약은 이 디렉터리와 `ARCHITECTURE.md`, 보관 정책은 [OPERATING_POLICY](../OPERATING_POLICY.md)를 따른다.
3. 상세 실행·감사·QA 원문은 비공개로 관리한다. 기존 날짜별 문서 경로는 안내용이며 최신 배포·권한의 통과 증명으로 사용하지 않는다.
4. `PROJECT_CONTEXT.md`의 과거 AI 계획, 디자인 초안은 구현 완료 목록이 아니다.

## 명세 상태

- **구현:** 코드 경로와 회귀 검사가 있다. 모든 실제 OS·사업자 환경에서 검증됐다는 뜻은 아니다.
- **환경 의존:** 이메일 발송, OAuth, OS 알림 등 별도 사업자 설정이나 실기기 확인이 필요하다.
- **보류:** 결제·유료 AI·스토어 심사·외부 백업 등은 현재 서비스 제공 계약에 넣지 않는다.

각 기능은 `FQ-01` 같은 고정 ID, 사용자 흐름, 데이터, 실패·복구, 수용 기준, 근거 파일을 가진다. API 내부형은 TypeScript, DB 제약은 마이그레이션 원문을 함께 확인한다.

## 문서 유지

```bash
npm run docs:generate
npm run docs:check
```

소스 지도는 파일·export·SQL 정의 위치만 자동 생성한다. 기능의 의미, 실패 조건, 출시 판정은 사람이 검토한다. `docs:check`는 링크·소스 지도·HTTP 메서드 누락을 찾지만 실제 기능 QA를 대신하지 않는다. 주석 원칙과 변경 절차는 [CONTRIBUTING](../../CONTRIBUTING.md)에 있다.
