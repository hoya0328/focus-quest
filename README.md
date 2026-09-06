<div align="center">
  <img src="./public/characters/momo-hiking.png" width="190" alt="Focus Quest 캐릭터 모리" />

  # Focus Quest

  **집중 시간을 작은 모험처럼 보여주는 포모도로 타이머**

  [직접 사용해보기](https://focus-quest.hoya0328.workers.dev)

  ![PWA](https://img.shields.io/badge/PWA-Installable-ef8b47?style=flat-square)
  ![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?style=flat-square&logo=typescript&logoColor=white)
  [![CI](https://github.com/hoya0328/focus-quest/actions/workflows/ci.yml/badge.svg)](https://github.com/hoya0328/focus-quest/actions/workflows/ci.yml)
</div>

---

## 왜 만들었나

공부할 때 휴대폰을 강제로 막는 앱보다, 그냥 계속 보고 싶어지는 집중 화면을 만들고 싶었습니다.

등산, 수영, 낚시 중 하나를 고르면 집중하는 동안 캐릭터가 조금씩 앞으로 나아갑니다. 타이머가 끝나면 시간만 기록되는 게 아니라 오늘의 작은 모험 하나가 완성됩니다.

## 지금 할 수 있는 것

- 등산, 수영, 낚시와 세 명의 캐릭터 선택
- 집중 1~120분, 휴식 1~30분 설정
- 여러 집중·휴식 세트를 하나의 모험으로 진행
- 전체 화면 집중과 작은 타이머
- 브라우저에서 바로 만들어지는 배경음
- 중간에 멈췄을 때 더 짧은 목표로 다시 시작
- 주간 기록과 자주 집중한 시간대 확인
- 새로고침 후 진행 중이던 타이머 복구
- 게스트 기록과 로그인 계정의 여러 기기 동기화
- PC와 모바일 사용, 홈 화면 설치

## 모험 친구들

| 모리 | 나루 | 보리 |
|---|---|---|
| <img src="./public/characters/momo-hiking.png" width="180" alt="산길잡이 모리" /> | <img src="./public/characters/podo-swimming.png" width="180" alt="유적 잠수부 나루" /> | <img src="./public/characters/bori-fishing.png" width="180" alt="낚시꾼 보리" /> |
| 해오름 봉우리 | 유리산호 유적 | 달비늘 호수 |

캐릭터와 화면은 다른 게임 에셋을 가져오지 않고 이 프로젝트에 맞게 직접 만든 픽셀 아트입니다.

## 사용 흐름

```text
모험 선택
  ↓
집중 시간과 휴식 설정
  ↓
캐릭터와 함께 집중
  ↓
완료 기록과 다음 모험
```

## 기술 구성

- Next.js 16, React 19, TypeScript
- 반응형 픽셀 UI
- Web Audio API 배경음
- LocalStorage 게스트 기록
- Supabase 계정 동기화와 사용자별 데이터 권한
- Service Worker와 Web App Manifest
- Cloudflare Worker 배포

## 로컬 실행

```bash
git clone https://github.com/hoya0328/focus-quest.git
cd focus-quest
npm install
npm run dev
```

## 현재 상태

웹과 PWA로 바로 사용할 수 있고, 기본 집중 흐름과 기록·복구·동기화까지 구현했습니다.

- [x] 세 가지 모험과 캐릭터
- [x] 포모도로와 여러 세트 진행
- [x] 배경음·주간 기록·타이머 복구
- [x] 모바일·PC 반응형 PWA
- [ ] 캐릭터 장비와 배지
- [ ] 새로운 모험 지역
- [ ] 네이티브 앱 패키징

---

<div align="center">
  <strong>오늘도 한 퀘스트, 내 속도로 앞으로.</strong>
</div>
