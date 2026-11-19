# DIBS

웹툰·웹소설 IP 크라우드펀딩 및 토큰증권 조각투자 플랫폼 (KDA 프로젝트).
투자 기능은 **모의투자 모드**로 동작해요.

| 폴더 | 내용 |
|---|---|
| [`backend/`](backend/) | FastAPI 백엔드 · API 110개 · 테스트 47개 · 문서(`backend/docs/`) |
| [`app/`](app/) | Expo(React Native) 앱 · Expo Go로 폰에서 바로 실행 |

## 폰에서 시연하기 (Expo Go)

준비물: Mac과 폰이 **같은 와이파이**, 폰에 **Expo Go** 앱.

```bash
# 1) 백엔드 (터미널 1)
cd backend
bash setup_mac.sh        # 처음 한 번: 가상환경·패키지·테스트·데모 데이터
bash run_dev.sh          # 화면에 나오는 "서버 주소"를 기억

# 2) 앱 (터미널 2)
cd app
npm install              # 처음 한 번
npx expo start           # QR 코드를 폰 카메라(iOS) 또는 Expo Go(Android)로 스캔
```

앱 첫 화면에서 서버 주소가 자동으로 채워져요 (Expo 개발 서버와 같은 PC의 8000번 포트). 다르면 1)에서 본 주소로 바꾸고 **연결 확인**을 누르세요.

### 시연 순서

1. **새 투자자(reader30)** 로 시작 → 홈(또는 탐색) → 펀딩 중인 작품(842%) → 손익분기 확인 → 투자성향 확인 → 조각 청약
2. 로그아웃 → **운영자** 로그인 → MY → 시연용 운영자 패널 → 그 펀딩 **마감 → 안분 배정** → **발행 4단계 → 상장**
3. 다시 reader30 → 증권 > 내 자산 > 청약·배정: "신청 N조각 → M조각 배정"
4. 증권 > 시세 → 「검을 거둔 아이」 → 호가 줄 눌러 매수 → 바로 체결
5. 운영자 패널 → 유료 회차 지정 → 이번 분기 배당 → 투자자 정산 리포트에 세후 배당

데모 데이터를 처음 상태로: `cd backend && rm dibs.db && .venv/bin/python -m scripts.seed_demo`

## 문서

- [화면 ↔ API 연결표](backend/docs/SCREEN_API_MAP.md)
- [API 명세](backend/docs/API_SPEC.md) · [ERD·돈 흐름](backend/docs/ERD.md)
- [이벤트 스키마 (데이터 분석)](backend/docs/EVENTS.md) · [v5.0 규칙과 코드 위치](backend/docs/OPEN_DECISIONS.md)
