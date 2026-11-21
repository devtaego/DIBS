# DIBS Backend (v0.1 기초)

> **2026-11-21 v2.2 조정값 적용:** 1조각 1,000원 · 모금액 80/12/5/3 · 배당 재원 60/30/10 · 만기 없음 · 창작자 토큰 5% · 보유 한도 10% · 씨앗 1개 = 100원. 근거와 전체 표는 [docs/DECISIONS-v2.2.md](docs/DECISIONS-v2.2.md). 아래 본문의 v4.0·v5.0 숫자는 이전 기준이며, 그 규칙은 설정값으로 남아 있다.

웹툰·웹소설 IP 크라우드펀딩 및 토큰증권 조각투자 플랫폼 **DIBS** 백엔드입니다.
서비스 기획서 v5.0의 흐름(작품 → 찜·유료 미리보기 → 청약 → 안분 배정 → 발행·상장 → 결제 시점 신탁 분할 → 분기 배당·공시 → 시즌 종료)을 API로 구현했습니다.
규칙 값과 구현 위치는 [docs/OPEN_DECISIONS.md](docs/OPEN_DECISIONS.md)에 정리했습니다.
투자 기능은 **모의투자 모드**가 기본입니다.

- 스택: Python 3.11+ (개발 기준 3.13) · FastAPI · SQLAlchemy 2 · Pydantic 2 · PyJWT · pytest
- DB: 개발은 SQLite, 운영은 PostgreSQL 권장 (`DIBS_DATABASE_URL` 만 바꾸면 됨)

## 빠른 시작

**macOS 한 번에 설치:** 압축을 푼 폴더에서 `bash setup_mac.sh`
(Python 확인·설치 → `.venv` 가상환경 → 고정 버전 패키지 → 테스트 → 데모 데이터 순서로 진행)

직접 설치할 때:

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

python -m scripts.seed_demo          # 데모 데이터 (모집 중 펀딩 145%, 상장 종목 청월도 + 호가, 모집 중 펀딩 6개)
uvicorn app.main:app --reload        # http://localhost:8000/docs  (Swagger UI)
pytest -q                            # 테스트 55개
python -m scripts.export_docs        # docs/API_SPEC.md · ERD.md · openapi.json 재생성
```

로그인(개발용): `POST /auth/dev-login {"email": "reader1@dibs.dev"}` → `access_token`을 Swagger의 Authorize에 넣으세요.
데모 계정: `admin@` (운영자, role=ADMIN), `creator@` (창작자, role=CREATOR), `reader1~30@` (회원, reader30은 청약 안 한 계정).

## 문서

| 문서 | 내용 |
|---|---|
| [docs/SCREEN_API_MAP.md](docs/SCREEN_API_MAP.md) | **화면별 API 연결표**: 진입 시 호출, 액션, 상태 분기, 에러 처리, 보낼 이벤트, 시연 순서 (**프런트 팀 공유**) |
| [docs/API_SPEC.md](docs/API_SPEC.md) | 엔드포인트 110개 표, 공통 규칙, 에러 코드 |
| [docs/ERD.md](docs/ERD.md) | 테이블 27개 ERD, 펀딩·청약·주문 상태 흐름, 원장 분개표 |
| [docs/EVENTS.md](docs/EVENTS.md) | 이용 이벤트 스키마와 연독률 등 지표 정의 (**데이터 분석 팀 공유**) |
| [docs/OPEN_DECISIONS.md](docs/OPEN_DECISIONS.md) | 기획 확정이 필요한 14개 항목과 코드에서 바꿀 곳 (**기획 팀 공유**) |
| docs/openapi.json | Postman·프런트 코드 생성기에서 가져오기용 |

## 구조

```
app/
  core/        설정, DB, 시간(clock), 인증, 에러
  models/      SQLAlchemy 모델 (ERD)
  schemas/     요청·응답 Pydantic 모델 (= API 명세)
  services/    비즈니스 로직 — API 계층과 분리되어 단위 테스트 가능
    ledger.py        복식부기 원장 (모든 돈의 이동)
    allocation.py    안분 배정 전략 (순수 함수, 교체 가능)
    funding.py       청약·마감·발행·상장·작가 지급
    market/          MarketGateway 인터페이스 + 내부 모의 거래소
    dividend.py      매출 집계·분기 배당
    wallet.py        코인·예치금
    content.py       작품·회차·찜·지표
    policy.py        모의/실거래 스위치, 투자 한도, 알림
  api/         FastAPI 라우터 (얇게 유지) — studio.py 는 크리에이터 스튜디오 전용
scripts/       seed_demo.py, export_docs.py
tests/         배정 알고리즘 단위 테스트 + 전체 흐름 E2E
```

## 설계 원칙

1. **돈은 원장으로만 움직인다.** 잔액 컬럼을 두지 않고 분개(Journal + Posting, 합계 0)를 쌓습니다. 시산표 API(`/admin/ledger/trial-balance`)의 모드별 합계는 항상 0입니다.
2. **코인과 예치금은 분리한다.** 계정 종류가 다르고, 코인 → 예치금 분개는 원장 계층에서 막습니다.
3. **모의/실거래는 데이터부터 분리한다.** 계정·펀딩·주문·보유 증권에 모두 `mode`가 있고, 다른 모드끼리는 한 분개에 섞이지 않습니다. `DIBS_LIVE_ENABLED=false`이면 LIVE 투자 요청을 거부합니다.
4. **바뀔 수 있는 규칙은 값이나 전략으로 둔다.** 배분율·수수료·한도는 설정값이나 펀딩별 컬럼으로, 배정 방식은 `AllocationStrategy`로, 마켓은 `MarketGateway`로 분리했습니다.
5. **금액은 정수, 비율은 bps.** 부동소수 오차가 없습니다. 배정은 정수 나눗셈과 나머지로 계산합니다.
6. **시간은 `clock.now()` 하나로.** 테스트에서 시간을 고정해 마감 1시간 전 잠금, 04:00 점검, 자정 취소, 배당 지급일을 검증합니다.

## 환경 변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `DIBS_DATABASE_URL` | `sqlite:///./dibs.db` | `postgresql+psycopg://...` |
| `DIBS_ENV` | `dev` | `prod`이면 개발용 로그인 차단 |
| `DIBS_JWT_SECRET` | 개발용 값 | 운영에서 반드시 교체 |
| `DIBS_TRADING_MODE` | `MOCK` | `MOCK` / `LIVE` |
| `DIBS_LIVE_ENABLED` | `false` | 인가 전에는 false 유지 |
| `DIBS_ENFORCE_GATE` | `false` | `true`면 펀딩 개설 조건(파일럿 열람자 × 15% 기준선)을 신청 때 강제 |
| `DIBS_KAKAO_CLIENT_ID` / `_SECRET` | 비움 | 카카오 REST API 키 (+ 보안 키). 비우면 모의 동의 화면 |
| `DIBS_NAVER_CLIENT_ID` / `_SECRET` | 비움 | 네이버 로그인 |
| `DIBS_GOOGLE_CLIENT_ID` / `_SECRET` | 비움 | 구글 로그인 |
| `DIBS_PUBLIC_BASE_URL` | 요청 주소 | 간편 로그인 콜백 주소 앞부분. 실제 키를 쓰면 등록한 주소로 고정 (예: `https://api.dibs.app`) |
| `DIBS_APP_REDIRECTS` | `dibs://,exp://,http://localhost,…` | 로그인 뒤 토큰을 붙여 돌려보낼 수 있는 앱 주소 (쉼표로 구분) |

## 간편 로그인 · 휴대폰 로그인

- 앱은 `GET /auth/social/{kakao|naver|google}/start?redirect_uri=dibs://auth`로 동의 화면 주소를 받아 인증 세션 브라우저로 연다.
  제공자가 `GET /auth/social/{provider}/callback`으로 돌려보내면 서버가 코드 교환 · 회원 조회/가입 뒤 `dibs://auth?token=…&is_new=1`로 앱에 돌려준다.
- 카카오 개발자 콘솔에 Redirect URI `{DIBS_PUBLIC_BASE_URL}/auth/social/kakao/callback`을 등록하고, 동의 항목은 닉네임·이메일(선택).
- 키가 없으면 서버가 띄우는 모의 동의 화면으로 같은 흐름을 탄다 (운영 `DIBS_ENV=prod`에서는 막힘).
- 휴대폰: `POST /auth/phone/request` → `POST /auth/phone/verify`. 개발·시연 환경은 문자 대신 응답의 `dev_code`로 확인한다 (문자 발송 대행사 연동은 다음 단계).

## 아직 안 한 것 (다음 단계)

- Alembic 마이그레이션 (지금은 `create_all`)
- 동시성: 운영 DB에서 계정·주문 행 잠금 (`SELECT ... FOR UPDATE`)과 멱등 키
- 배치 스케줄러: 마감 처리, 자정 주문 취소, 04:00 기준가 갱신 (지금은 `/admin/jobs/*`를 수동 호출)
- 실제 연동: 본인확인기관, 문자 발송, Apple 로그인, PG·인앱결제, 제휴 증권사 발행 API, 장외거래소 어댑터
- 세계관 묶음(ETF형) 상품 (확장 단계)
- 파일 업로드(회차 이미지·숏츠 영상): 지금은 URL만 저장
