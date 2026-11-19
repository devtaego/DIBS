# DIBS 앱 (Expo)

Expo SDK 58 · Expo Router · TypeScript. 실행 방법은 저장소 루트 README를 보세요.

```
src/
  app/            화면 (Expo Router: 파일 = 화면)
    (tabs)/       홈 · 숏츠 · 조각 마켓 · 내 증권 · MY
    work/ episode/ funding/ subscribe/ security/ order/   상세 화면
    risk-profile  wallet  dividends  notifications  admin(시연용 운영자 패널)  login
  components/ui.tsx   공통 UI (카드·버튼·배지·진행 바·체크·스테퍼)
  lib/api.ts          백엔드 API 클라이언트 + 응답 타입
  lib/session.tsx     로그인 상태
  lib/useApi.ts       화면 들어올 때 다시 불러오기 + 주기 갱신
  lib/theme.ts        미드나잇 + 메탈릭 핑크 팔레트
```

- 패키지는 `npx expo install <이름>`으로 추가하세요 (SDK 58과 맞는 버전으로 설치돼요).
- 타입 검사: `npx tsc --noEmit`
