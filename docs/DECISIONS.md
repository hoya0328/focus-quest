# Focus Quest 기술 결정

## React와 Phaser의 책임 분리

설정·기록·상태 전이는 React, 모험 표현은 Phaser에 둔다. 장면 완료 연출이 실제 세션 기록을 확정하지 않는다. 근거와 변경 조건은 [아키텍처](ARCHITECTURE.md), [집중 명세](engineering/FEATURES_CORE.md)에 있다.

## 절대 시각 기반 타이머

브라우저 tick 횟수가 아니라 deadline과 현재 시각의 차이로 남은 시간을 계산한다. paused snapshot은 초, deadline은 밀리초다. OS 백그라운드 실행·종료 알림의 보장과 구분한다.

## 개인 데이터의 소유권과 충돌

공개판은 Supabase JWT/RLS/RPC/Storage로 계정을 분리한다. 로컬 owner 표식은 캐시 이관 규칙이며 인증 수단이 아니다. cloud revision CAS와 세션 ID 중복 제거를 사용한다. [데이터·권한](engineering/DATA_MODEL.md).

## 선택형 학습 확장

기본 타이머는 자료 업로드·가입 없이 시작한다. 현재 PDF 가이드/퀴즈는 규칙 기반이며 유료 AI 의미 분석이 아니다. [학습 명세](engineering/FEATURES_LEARNING.md).

## 방문 분석과 운영 통계의 분리

공개 방문 분석은 선택형 Cloudflare Web Analytics, 로그인 후 기능 이용은 기존 Supabase 이벤트로 분리한다. 기본 방문 분석은 꺼짐이며 공부 내용·계정 식별자를 외부 beacon에 붙이지 않는다. 운영 화면은 서버 전용 UUID allowlist로 보호하고 익명 집계가 아닌 계정 연결 원본을 개인정보로 관리한다. 이벤트 건수·기간 내 이용자 비율과 세션 완주율·가입 코호트 유지율을 혼용하지 않는다. [기능 계약](engineering/FEATURES_PLATFORM.md#fq-16--검색-발견성과-운영자-통계).

메인 화면에는 동의 설정 박스를 두지 않는다. 회원가입의 기본 미선택 항목으로 새 방문 분석 허용을 받고, 이미 정한 선택의 변경·철회는 개인정보 처리방침에서 제공한다. 이 선택은 기기·브라우저에만 적용되며 필수 가입 동의나 계정별 이용 이벤트의 수집 근거로 재사용하지 않는다.

## 비공개 문의 접수

문의 메모는 메일 클라이언트 없이 제출하며 기존 운영자 UUID allowlist의 계정만 읽는다. 로그인·이메일과 연결하지 않고 별도 안내 확인을 받는다. 서버 접수 RPC의 원자적 한도로 남용을 완화하고 접수 후 90일 정리한다. 단기 문의를 학습 기록 백업에 넣지 않으므로 문의함의 독립 복구를 보장하지 않는다. [API 계약](engineering/API_CONTRACTS.md#post-apisupport-get-apisupport-patch-apisupport).

## 문서 일치 기준

계약은 기능 ID·수용 기준·소스/테스트 연결로 유지한다. 새 API/테이블은 문서 검사에서 누락을 확인한다. 개인 작업 체계·상세 실행 로그를 기술 결정과 섞지 않는다. [변경 기준](../CONTRIBUTING.md).
