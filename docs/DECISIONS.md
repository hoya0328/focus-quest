# Focus Quest 기술 결정

## React와 Phaser의 책임 분리

설정·기록·상태 전이는 React, 모험 표현은 Phaser에 둔다. 장면 완료 연출이 실제 세션 기록을 확정하지 않는다. 근거와 변경 조건은 [아키텍처](ARCHITECTURE.md), [집중 명세](engineering/FEATURES_CORE.md)에 있다.

## 절대 시각 기반 타이머

브라우저 tick 횟수가 아니라 deadline과 현재 시각의 차이로 남은 시간을 계산한다. paused snapshot은 초, deadline은 밀리초다. OS 백그라운드 실행·종료 알림의 보장과 구분한다.

## 개인 데이터의 소유권과 충돌

공개판은 Supabase JWT/RLS/RPC/Storage로 계정을 분리한다. 로컬 owner 표식은 캐시 이관 규칙이며 인증 수단이 아니다. cloud revision CAS와 세션 ID 중복 제거를 사용한다. [데이터·권한](engineering/DATA_MODEL.md).

## 선택형 학습 확장

기본 타이머는 자료 업로드·가입 없이 시작한다. 현재 PDF 가이드/퀴즈는 규칙 기반이며 유료 AI 의미 분석이 아니다. [학습 명세](engineering/FEATURES_LEARNING.md).

## 문서와 검증

계약은 기능 ID·수용 기준·소스/테스트 연결로 유지한다. 새 API/테이블은 문서 검사에서 누락을 확인한다. 개인 작업 체계·상세 실행 로그를 기술 결정과 섞지 않는다. [변경 기준](../CONTRIBUTING.md).
