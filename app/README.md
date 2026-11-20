# DIBS 앱 (Expo)

Expo SDK 58 · Expo Router · TypeScript. 백엔드 실행은 저장소 루트 README를 보세요.

## Expo Go로 휴대폰에서 시연하기

준비: 휴대폰에 **Expo Go** 앱 설치 (SDK 58 지원 버전), PC에 Node 20 이상.

```bash
cd app
npm install
npm run demo          # 백엔드 없이 시연 데이터로 실행 (권장)
```

터미널에 뜨는 QR 코드를 찍으면 열려요 (iPhone은 기본 카메라, Android는 Expo Go 앱의 스캔).

| 명령 | 쓰임 |
|---|---|
| `npm run demo` | **시연 모드.** 서버 없이 녹화된 시연 데이터로 동작, reader1 로 자동 로그인. 청약·찜은 흉내만 내고 저장 안 됨 |
| `npm run demo:tunnel` | 휴대폰과 PC가 같은 와이파이가 아닐 때 (회사망·핫스팟). 처음 한 번 `@expo/ngrok` 설치를 물어보면 `y` |
| `npm run live` | 실제 백엔드에 붙기. PC에서 백엔드를 `DIBS_NOW=2027-03-02T09:00:00 uvicorn app.main:app --host 0.0.0.0 --port 8000` 으로 켜 두면 (시연 기준 시각: 조각투자 개정 시행 이후 2027-03-02) 앱이 PC 주소를 자동으로 찾음 |

- 모드를 바꿀 때는 Expo Go에서 앱을 완전히 닫았다가 다시 여세요 (`-c` 로 캐시를 지우고 시작함).
- 안 열리면: 같은 와이파이인지 → `demo:tunnel` → PC 방화벽에서 8081 포트 허용.
- 표지·1화 원고·쇼츠 영상(`public/`)은 iOS·Android에서 앱에 함께 묶여서 인터넷 없이도 보여요.

## 시연 데이터와 미디어

- 시연 데이터: `src/lib/demo-fixtures.json` (백엔드 시드 `backend/scripts/seed_demo.py` → `scripts/record_demo.py` 로 녹화)
- 미디어: `public/covers`(표지) · `public/episodes`(1화 원고) · `public/shorts`(쇼츠)
  - 파일을 추가·삭제하면 `python3 scripts/gen_media_map.py` 로 `src/lib/media.native.ts` 를 다시 만들 것
  - 쇼츠 모션코믹 3편은 `python3 scripts/make_demo_shorts.py` 로 원고에서 생성 (편의점 마법사·내가 찬 남자는 원본 영상)
- 웹 데모(Claude 아티팩트) 빌드: `EXPO_PUBLIC_DEMO=1 npx expo export --platform web --output-dir dist-demo` 후 `python3 scripts/artifact_postprocess.py dist-demo`

## 구조

```
src/
  app/            화면 (Expo Router: 파일 = 화면)
    (tabs)/       홈 · 탐색 · 쇼츠 · 조각 마켓 · MY
    work/ episode/ funding/ subscribe/ security/ order/   상세 화면
    risk-profile  wallet  dividends  notifications  admin(시연용 운영자 패널)  login
  ds/             디자인 시스템 v2.0 (토큰 · 기본 요소 · 컨트롤 · 레이아웃 · 투자 컴포넌트)
  components/     디비(마스코트) · 쇼츠 영상(웹/네이티브) · 이전 공통 UI
  lib/api.ts      백엔드 API 클라이언트 (+ 시연 모드면 demo.ts 로)
  lib/media.ts    미디어 경로 → 이미지/영상 소스 (웹), media.native.ts (iOS·Android, 자동 생성)
```

- 패키지는 `npx expo install <이름>`으로 추가하세요 (SDK 58과 맞는 버전으로 설치돼요).
- 타입 검사: `npm run typecheck`
