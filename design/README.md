# 디자인

- `최종.html` — 디자인 시스템 v1.0 + '06 탐색' 화면 시안 (브라우저로 열면 보임)
- `tokens.css` — 위 파일에서 뽑은 토큰(색·글자·간격·모서리). 앱에서는 `app/src/lib/theme.ts`에 같은 이름 체계로 옮겨 둠

앱 반영 규칙
- 화면 코드는 atomic 값을 직접 쓰지 않고 `colors.*`(semantic)만 쓴다
- 기본은 라이트(최종 시안 기준). 다크는 `theme.ts`의 `MODE`를 `'dark'`로
- 하단 탭: 홈 · 탐색 · 숏츠(가운데 원형 버튼) · 증권(시세/내 자산) · MY

## 프로토타입 (마스코트 디비)

- `DIBS_프로토타입_디비.html` — 클릭 프로토타입 (홈 · 탐색 · 작품 · 청약 · 증권 · 종목 · 주문 · MY · 로딩/완료)
- 디비 이미지: `app/assets/dibby/` (포즈 12종 + 표정 8종, 프로토타입에서 추출)
- 앱 공통 조각: `app/src/components/dibby.tsx` (Dibby · Greet · DNote · DEmpty · Cover · MiniWork · Ride · CtaBar · DibbyLoading)
- 디비 사용 원칙: 결제·청약·주문의 로딩과 완료, 빈 화면, 위험 안내에만. 호가·차트 본문엔 넣지 않고, 수익·가격 상승을 축하하지 않음. 한 화면에 한 번만
