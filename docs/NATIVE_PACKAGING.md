# Focus Quest 설치·네이티브 패키징 기준

## 현재 제공 범위

- 웹과 동일한 계정·기록을 사용하는 설치형 PWA
- Android·데스크톱 Chromium의 설치 프롬프트
- iOS Safari의 홈 화면 추가 안내
- 192px·512px 일반 아이콘과 512px maskable 아이콘
- Service Worker 오프라인 셸, Web Push, 지원 브라우저의 작은 타이머

## 스토어 패키징 전제

Focus Quest는 Supabase 인증과 Cloudflare API를 사용하는 온라인 서비스이므로 정적 웹 파일을 앱에 복사하는 방식보다 검증된 운영 도메인을 기준으로 패키징한다. Android는 TWA, iOS는 실제 네이티브 기능을 포함한 얇은 셸을 우선 검토한다.

스토어 제출에는 다음 외부 조건이 필요하다.

1. Apple Developer·Google Play Console 계정과 각 스토어의 비용
2. 패키지 ID와 서명 인증서
3. Android Digital Asset Links의 인증서 지문
4. iOS 알림·위젯·Live Activity를 구현하고 서명할 macOS/Xcode 환경
5. 개인정보 처리방침, 이용약관, 스토어 심사용 화면과 실기기 QA

이 저장소에는 서명키·인증서·프로비저닝 프로파일을 넣지 않는다. 현재 PWA가 공개 베타의 정식 설치 경로이며, 네이티브 셸은 위 조건을 승인한 뒤 별도 릴리스 산출물로 만든다.
