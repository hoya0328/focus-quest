# Focus Quest 기술 인수인계

새 담당자는 [기술 문서 시작점](engineering/README.md)에서 실행 환경과 기능별 계약을 확인한다.

| 목적 | 문서 |
| --- | --- |
| 실행·환경 설정 | [개발 시작 안내](engineering/ONBOARDING.md) |
| 기능·구조 | [기술 명세](engineering/README.md), [아키텍처](ARCHITECTURE.md) |
| 데이터·권한·연동 | [데이터 모델](engineering/DATA_MODEL.md), [API 계약](engineering/API_CONTRACTS.md) |
| 검증·장애 대응 | [품질 기준](engineering/QUALITY.md), [운영 런북](OPERATIONS_RUNBOOK.md) |
| 검색·운영 통계 | [발견성과 측정 계약](engineering/FEATURES_PLATFORM.md#fq-16--검색-발견성과-운영자-통계), [HTTP 계약](engineering/API_CONTRACTS.md) |
| 서비스명·검색 제목·공유 설명 | [공개 문구 설정](../lib/service-config.ts), [홈 구조화 데이터](../lib/search-discovery.ts), [렌더링 검증](../tests/rendered-html.test.mjs) |
| 외부 의존·미완료 검증 | [현재 제한](engineering/LIMITATIONS.md) |

공개 문서는 구현 계약을 설명한다. 상세 실행·승인 이력, 배포 식별자별 내부 기록, 사용자 자료와 자격 증명은 비공개 운영 기록으로 관리하며 이 파일에 추가하지 않는다. 과거 검증 결과를 현재 배포의 증거로 간주하지 않는다.
