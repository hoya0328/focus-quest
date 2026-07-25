# Focus Quest 개발 환경

현재 개발 시작 안내는 [ONBOARDING](engineering/ONBOARDING.md)을 따른다.

- 저장소 루트에서 `Focus Quest.code-workspace`를 열고 npm과 lockfile을 유지한다.
- `npm ci`, `npm run dev`로 실행하고 실제 포트는 Vite 출력으로 확인한다.
- 환경 변수는 `.env.example`의 이름만 참고하고 실제 값은 Git 제외된 환경에 설정한다.
- TypeScript·React·Next.js·Vinext·Phaser·PWA 구조와 기존 hosting 식별자를 보존한다.
- 생성물·캐시·백업을 숨기는 Explorer 설정은 파일 삭제를 뜻하지 않는다.
- 공개 배포는 기존 승인된 Worker 대상이며 GitHub Pages 정적 export가 아니다.
- 개인 PC 절대 경로·대화 트리거·작업 약속·계정 로그인 이력은 공개 환경 명세에 기록하지 않는다.

[소스 지도](engineering/SOURCE_MAP.md) · [검증 기준](engineering/QUALITY.md) · [운영](OPERATIONS_RUNBOOK.md)
