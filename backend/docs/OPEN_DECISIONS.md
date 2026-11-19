# 규칙 기준과 남은 결정

> **기준 문서: DIBS 서비스 기획서 v5.0 (2026-11-19).** 아래 표는 v5.0 규칙이 코드에서 어떤 값·함수로 구현됐는지 보여 준다. 규칙을 바꾸면 이 표와 `core/config.py`를 함께 고친다.
> v4.0에서 바뀐 것: 만기 없음 → **시즌 + 완결 후 12개월**, 최소 3,000만 → **1,000만**, 목표 상한 48개월 → **상품 기간 투자자 몫 × 70%**, 개설 조건 열람자 → **유료 구매자**, 모금액 80/12/8 → **85/12/3**, 작가 매입 의무 → **선택**, 결제 → **상장 작품은 결제 시점에 신탁 계좌로 분할**, 공시 API 추가.

## v5.0 규칙 → 코드

| 단계 | 규칙 | 코드 (설정값) | 구현 위치 |
|---|---|---|---|
| 발행 전 | 파일럿 1~3화 무료, 4화부터 유료 미리보기 300원, 공개 21일 뒤 무료 | `pilot_free_episodes 3`, `default_preview_price_coin 300`, `preview_free_after_days 21` | `services/content.py::set_episode_pricing`, `Episode.is_paid` |
| 발행 전 | 발행 전 순매출 작가 70 / DIBS 30 | `pre_issuance_creator_bps 7000` | `services/content.py::pre_issuance_settlement` |
| 발행 전 | 펀딩 개설 조건: 파일럿 4주 유료 구매자 ≥ 목표 금액에 필요한 유료 팬 (1,000만 원 → 3,388명) | `gate_ratio_bps 10000`, `enforce_funding_gate` | `services/product.py::funding_gate` (`GET /works/{id}/funding-gate`) |
| 청약 | 상품 기간: 시즌 연재 12개월 + 완결 후 12개월, 완결 뒤 매출 40%에서 연 30% 감소 | `season_months 12`, `tail_months 12`, `tail_level_bps 4000`, `tail_decay_bps_per_year 3000` | `services/product.py::season_curve`, `simulate` |
| 청약 | 목표 금액 상한 = 유료 팬 × 1명당 상품 기간 투자자 몫(세후, 약 4,217원) × 70% | `cap_safety_bps 7000` | `services/product.py::target_cap` |
| 청약 | 발행 단위: 작품별 증권, 작품당 1,000만 원 이상 | `min_target_amount 10_000_000` | `services/funding.py::_validate_terms` |
| 청약 | 공모 회차: 같은 달 공모 작품은 신고·법률·회계 검토를 함께 진행 (증권은 작품별) | `fundings.offering_round` | `GET /fundings?offering_round=2027-03` |
| 청약 | 투자 지표 카드: 찜·연독률·유료 팬, 시나리오(0.4·0.7·1.0·1.5배)별 총회수 배수와 원금 회수 달, 1인 최대 손실. 연 수익률은 표시하지 않음 | `SCENARIOS` | `GET /fundings/{id}/indicators` |
| 청약 | 초과청약 배정 균등 20 / 비례 80. 비례분은 원래 청약 수량 기준, 균등분이 참여자보다 적으면 공개 추첨 | `default_equal_ratio_bps 2000`, `lottery_seed` = 펀딩 번호 | `services/allocation.py::EqualThenProRata` |
| 청약 | 우선 배정 10% = 초기 독자(모집 7일 전 찜 + 모집 전 완독 + 본인인증) ∪ **이전 시즌 보유자** | `default_early_reader_bps 1000` | `services/funding.py::early_readers`, `prior_season_holders` |
| 청약 | 다음 시즌 펀딩: 이전 시즌이 완결 처리되면 신청 가능 | `Funding.completed_at` | `services/funding.py::apply_funding` |
| 청약 | 1인 한도 min(3,000만 원, 발행액 5%) → 1,000만 원 발행이면 50만 원 | `max_subscription_amount`, `max_subscription_bps 500` | `services/product.py::per_user_cap_units` |
| 청약 | 동의: 투자 위험, 시즌 기간·종료 규칙 | `agree_termination_rule` | `/policies/termination-rule` |
| 발행 | 모금액 작가 85 / 발행 실비 12 / DIBS 3 (DIBS는 주로 매출 배분에서 번다) | `creator_bps 8500`, `issuance_cost_bps 1200`, `platform_fee_bps 300` | `services/funding.py::_list_security` |
| 발행 | 작가 지급 상장 40 · 10화 30 · 20화(완결) 30, 중단 시 미지급분 보유자 분배 | `default_payout_schedule` | `services/funding.py::_pay`, `discontinue` |
| 상장 후 | **결제 시점 신탁 분할**: 상장 작품 유료 결제는 DIBS 매출 계정을 거치지 않고 신탁 계좌로 | `SYS_TRUST_RECEIVABLE`, `EpisodeUnlock.funding_id` | `services/content.py::unlock_episode`, `live_funding` |
| 상장 후 | 배당 재원 = 신탁 분할된 결제액 − 인앱 30% (+ 광고·굿즈·독점 뒤 외부 수익 작가 몫 20%) | `inapp_fee_bps 3000`, `external_share_bps 2000` | `services/dividend.py::aggregate_paid_episode_revenue`, `add_revenue` |
| 상장 후 | 배분 회수 전 작가 30 / 투자자 45 / DIBS 25 → 세후 회수 다음 분기부터 40 / 35 / 25 | `royalty_*_bps`, `royalty_*_after_bps`, `fundings.recouped_period` | `services/product.py::split_for`, `services/dividend.py::calculate` |
| 상장 후 | **공시**: 투자금 100원 쓰임, 매출 배분, 상품 기간, 분기별 대사(결제 원천 = 신탁 입금 = 배당 재원, 누수 0건), 결제 기록 SHA-256 연쇄 해시 | — | `services/disclosure.py` (`GET /fundings/{id}/disclosure`) |
| 상장 후 | 분기 배당, 다음 달 10일, 원천징수 15.4% | `dividend_pay_day 10`, `dividend_tax_bps 1540` | `services/dividend.py` |
| 상장 후 | 거래 수수료 0.015%, 거래소·증권사 몫 (1단계는 유통 없이 시즌 정산, 모의 거래소는 시연용) | `trade_fee_ppm 150` → `SYS_BROKER_FEE` | `services/market/mock_exchange.py` |
| 상장 후 | 종료: 완결 후 12개월 또는 분기 순매출 < 발행액 0.5% 2분기 연속 | `termination_after_completion_months 12`, `low_revenue_bps 50`, `low_revenue_quarters 2` | `services/product.py::termination_check`, `terminate` |
| 상장 후 | 작가 매입 옵션 (선택 사항) = 최근 4분기 보유자 분배금 합계 × 3 | `Funding.buyback_enabled`, `buyback_multiple 3` | `services/product.py::buyback` |
| 상장 후 | 일반투자자 연 1억 원(장외 순매수 한도), 종목당 3,000만 원 | `annual_limit_general`, `per_security_limit_general` | `services/policy.py` |

## B안 증권사 연계 → 코드 (읽기는 DIBS, 청약·계좌·보유는 증권사)

실제 증권사 제휴 API는 계약 후에만 받을 수 있다(공개된 키움 REST API는 개인 자동매매용). 그래서 아래는 **DIBS가 제안하는 연동 규격**이고, dev 모의 키움 서버가 같은 규격으로 움직여 처음부터 끝까지 시연된다. 계약 후에는 모의 서버 대신 실제 증권사가 같은 규격으로 웹훅을 보낸다.

| 규칙 | 코드 (설정값) | 구현 위치 |
|---|---|---|
| 청약 경로: INTERNAL(앱 안 모의 청약, 증권사 화면 대체) / BROKER(증권사 청약 화면) | `subscription_channel` (`DIBS_SUBSCRIPTION_CHANNEL`) | `GET /config/public` |
| 청약 넘기기: 서명된 넘김 토큰(10분) + 증권사 딥링크 | `broker_shared_secret`, `broker_deeplink_base`, `handoff_ttl_minutes` | `POST /fundings/{id}/broker-handoff`, `POST /broker/handoff/verify` |
| 계좌·실명·CI 미저장, 가명 연결 식별자만 | `BrokerLink.link_ref` | `models/broker.py` |
| 우선 배정 명단(초기 독자 ∪ 이전 시즌 보유자)을 연결 식별자로 전달 | — | `GET /broker/fundings/{id}/priority-list` |
| 웹훅 6종, HMAC 서명 + X-Event-Id 중복 방지 | `BrokerEvent` | `POST /broker/webhooks/{event}` |
| 청약 현황은 집계만 수신 (미공개 정보 위험 차단) | `BrokerOfferingState` | `subscription-summary` |
| 분배 지시서(연결 식별자별 세전) → 증권사 지급·원천징수 → 완료 웹훅으로 금액 대조 | — | `GET /broker/dividend-runs/{id}/instruction`, `payout-completed` |
| 계좌 개설 쿠폰: 증권사가 산 코인을 신규 계좌 고객에게 (청약 여부와 무관) | `partner_coupon_coin 20000`, `SYS_PARTNER_COUPON` | `services/broker::grant_coupon` |
| 투자 경험 없는 고객 소액 한도 10만 원 | `first_time_cap_amount`, `User.no_investment_experience` | `services/funding.py::_check_first_time_cap` |
| 모의 키움 서버 (dev 전용) | `enable_mock_broker` | `services/broker/mock_kiwoom.py`, `/dev/mock-kiwoom/*` |

## 아직 정할 것

| # | 항목 | 현재 처리 | 검토 포인트 |
|---|---|---|---|
| 1 | 증권 유형 | `security_type = UNDECIDED` | 1순위 비금전신탁 수익증권(발행법 국회 계류), 투자계약증권 경로 병행. 팀 확인 필요 |
| 2 | 초기 독자 우선 배정의 적법성 | 구현됨 (찜 + 완독 + 본인인증) | 증권신고서 명시, 법률 검토 후 확정. 리워드 후원자는 후원 기능 연동 뒤 추가 |
| 3 | 펀딩 개설 조건 강제 여부 | 기본 꺼짐 (`DIBS_ENFORCE_GATE=true`로 켬) | 시연 데이터 규모가 작아서 꺼 둠. 운영에서는 켬 |
| 4 | 공모 회차 개최 기준 | `offering_round` 로 묶어 조회만 함 | 회차 총액 1.5억 원 이상일 때 개최, 미만이면 다음 달로. 표준 계약서·핵심설명서·자동 정산으로 작품당 추가 비용을 낮춤 |
| 5 | 세계관 묶음(ETF형) 상품 | 확장 단계 | 상장 작품이 쌓이고 여러 기초자산을 묶은 상품이 허용된 뒤 |
| 6 | 투자 한도 계산 방식 | 청약 + 체결 매수 + 미체결 매수 (총매수 기준) | 법령은 '연간 순매수' 기준 → 매도분 차감 여부 |
| 7 | 마켓 운영 주체 | 내부 모의 거래소 (`InternalMockExchange`) | 실서비스는 장외거래소 API. `MarketGateway` 구현만 교체 |
| 8 | 가격제한폭·호가 단위 | 모의: 기준가 ±30%, 1원 단위 | 장외거래소 규정을 따름 |
| 9 | 리워드 후원(보상형) 수수료 8% | 설정값만 있음 (`reward_support_fee_bps`) | 보상형 후원은 외부 PG·크라우드펀딩 연동으로 처리 예정 |
| 10 | 배당 원 단위 절사 잔여 | 플랫폼 귀속 (`dividend_runs.residual`) | 다음 분기 이월 |
| 11 | 원천징수 절사 단위 | 원 단위 내림 | 세법상 10원 미만 절사 규칙 확인 |
| 12 | 한정 리워드 재고 | 청약 시점 선점 + 마감 시 먼저 청약한 순 | 배정 조각 수 순 |
| 13 | 투자성향 확인 | 5문항 합계로 3단계 (모의) | 제휴 증권사 적합성 기준을 따름 |
| 14 | 실서비스 신탁 분할 | 원장 안의 `SYS_TRUST_RECEIVABLE` 계정 (모의) | PG 분할정산으로 신탁사 계좌 직접 입금, 월별 PG 대사, 연 1회 외부 감사 |
| 15 | 시즌 길이 | 기본 12개월 | 작품별 시즌 회차 수에 맞춰 심사 때 조정할지 |

## 기획서와 다르게 해석한 부분

- **예치금 → 코인 전환**: 모의 예치금으로 실제 코인을 살 수 있으면 안 되므로 실거래 모드에서만 허용했다.
- **기준가(전일 종가)**: 모의 거래소는 24시간 거래라 **04:00 점검 시작 시점의 직전 체결가**로 정의했다 (`/admin/jobs/roll-reference-prices`).
- **배당 기준일 보유 수량**: 계산 시점이 아니라 기준일(분기 말일 24:00) 시점으로 거슬러 계산한다.
- **거래 수수료 원 미만**: 0.015%는 소액 거래에서 1원 미만이 되므로 원 단위로 내린다.
- **작가 매입가**: 매입 옵션을 선택한 펀딩만. 배당 이력이 4분기보다 적으면 있는 분기의 합계 × 3을 쓴다. 배당 이력이 없으면 매입할 수 없다.
- **목표 상한의 투자자 몫**: 상한 산정 때는 첫 분기 뒤로 회수 후 비율(35%)을 적용해 보수적으로 잡는다.
- **원장 해시**: 회원 식별자를 넣지 않고 결제 id·회차·금액·시각만 연쇄 해시한다 (개인정보 없이 공시).
