# 규칙 기준과 남은 결정

> **기준 문서: DIBS 서비스 기획서 v4.0 (2026-11-19).** 아래 표는 v4.0 규칙이 코드에서 어떤 값·함수로 구현됐는지 보여 준다. 규칙을 바꾸면 이 표와 `core/config.py`를 함께 고친다.
> 기획안 v2.0·v3.0 기준 값(배당 30/30/40, 수수료 1%, 36개월 만기, 1인 300만 원, 최소 1,000만 원, 시즌 묶음)은 모두 대체됐다.

## v4.0 규칙 → 코드

| 단계 | 규칙 | 코드 (설정값) | 구현 위치 |
|---|---|---|---|
| 발행 전 | 파일럿 1~3화 무료, 4화부터 유료 미리보기 300원, 공개 21일 뒤 무료 | `pilot_free_episodes 3`, `default_preview_price_coin 300`, `preview_free_after_days 21` | `services/content.py::set_episode_pricing`, `Episode.is_paid` |
| 발행 전 | 발행 전 순매출 작가 70 / DIBS 30 | `pre_issuance_creator_bps 7000` | `services/content.py::pre_issuance_settlement` (`GET /admin/works/{id}/pre-issuance-settlement`) |
| 발행 전 | 펀딩 개설 조건: 파일럿 4주 열람자 ≥ 4년 회수 필요 열람자의 50% | `gate_ratio_bps 5000`, `recoup_target_months 48`, `enforce_funding_gate` | `services/product.py::funding_gate` (`GET /works/{id}/funding-gate`) |
| 청약 | 발행 단위: 작품별 증권, 작품당 3,000만 원 이상 | `min_target_amount 30_000_000` | `services/funding.py::_validate_terms` |
| 청약 | 공모 회차: 같은 달 공모 작품은 신고·법률·회계 검토를 함께 진행 (증권은 작품별) | `fundings.offering_round` (기본: 모집 시작 달) | `GET /fundings?offering_round=2027-03` |
| 청약 | 목표 금액 상한 = 예상 월 투자자 몫(세후) × 48 | 결제율 15%, 월 4화, 남는 비율 70% (가정값) | `services/product.py::target_cap` |
| 청약 | 초과청약 배정 균등 20 / 비례 80. 비례분은 원래 청약 수량 기준, 균등분이 참여자보다 적으면 공개 추첨 | `default_equal_ratio_bps 2000`, `lottery_seed` = 펀딩 번호 | `services/allocation.py::EqualThenProRata` |
| 청약 | 초기 독자 우선: 균등분 중 발행량 10% 먼저. 자격 = 모집 7일 전까지 찜 + 모집 전 완독 1회 + 본인인증 | `default_early_reader_bps 1000`, `early_reader_dib_days_before 7` | `services/funding.py::early_readers`, `EqualThenProRata` |
| 청약 | 1인 한도 min(3,000만 원, 발행액 5%) | `max_subscription_amount`, `max_subscription_bps 500` | `services/product.py::per_user_cap_units` |
| 청약 | 동의: 투자 위험, 만기 없음·종료 규칙 | `agree_termination_rule` | `api/fundings.py::subscribe`, `/policies/termination-rule` |
| 발행 | 모금액 작가 80 / 발행 실비 12 / DIBS 8 | `creator_bps 8000`, `issuance_cost_bps 1200`, `platform_fee_bps 800` | `services/funding.py::_list_security` |
| 발행 | 작가 지급 상장 40 · 10화 30 · 20화(완결) 30, 중단 시 미지급분 보유자 분배 | `default_payout_schedule` | `services/funding.py::_pay`, `discontinue` |
| 상장 후 | 배당 재원 회수 전 작가 30 / 투자자 45 / DIBS 25 → 회수 후 40 / 35 / 25 | `royalty_*_bps`, `royalty_*_after_bps` | `services/product.py::split_for`, `services/dividend.py::calculate` |
| 상장 후 | 회수 판정: 누적 세전 분배금 ≥ 발행액이 된 다음 분기부터, 모든 보유자 동시 | `fundings.recouped_period` | `services/dividend.py::calculate` |
| 상장 후 | 순매출 = 미리보기·광고·굿즈 − 인앱 30% − 굿즈 원가 + 독점 12개월 뒤 외부 수익 작가 몫의 20% | `inapp_fee_bps 3000`, `exclusive_months 12`, `external_share_bps 2000` | `services/dividend.py::add_revenue` |
| 상장 후 | 분기 배당, 다음 달 10일, 원천징수 15.4% | `dividend_pay_day 10`, `dividend_tax_bps 1540` | `services/dividend.py` |
| 상장 후 | 거래 수수료 0.015%, 거래소·증권사 몫 (배당 재원 아님) | `trade_fee_ppm 150` → `SYS_BROKER_FEE` | `services/market/mock_exchange.py` |
| 상장 후 | 만기 없음. 완결 후 3년 또는 분기 순매출 < 발행액 0.5% 2분기 연속이면 종료 | `termination_after_completion_months 36`, `low_revenue_bps 50`, `low_revenue_quarters 2` | `services/product.py::termination_check`, `terminate` |
| 상장 후 | 작가 매입 옵션 = 최근 4분기 보유자 분배금 합계 × 3 | `buyback_multiple 3` | `services/product.py::buyback` (`POST /fundings/{id}/buyback`) |
| 상장 후 | 일반투자자 연 1억 원(장외 순매수 한도), 종목당 3,000만 원 | `annual_limit_general`, `per_security_limit_general` | `services/policy.py` |

## 아직 정할 것

| # | 항목 | 현재 처리 | 검토 포인트 |
|---|---|---|---|
| 1 | 증권 유형 | `security_type = UNDECIDED`, 기획서는 투자계약증권 기본 | 신탁 수익증권 법안 통과 시 전환. 세금 처리가 달라짐 |
| 2 | 초기 독자 우선 배정의 적법성 | 구현됨 (찜 + 완독 + 본인인증) | 증권신고서 명시, 법률 검토 후 확정. 리워드 후원자는 후원 기능 연동 뒤 추가 |
| 3 | 펀딩 개설 조건 강제 여부 | 기본 꺼짐 (`DIBS_ENFORCE_GATE=true`로 켬) | 시연 데이터 규모가 작아서 꺼 둠. 운영에서는 켬 |
| 4 | 공모 회차 개최 기준 | `offering_round` 로 묶어 조회만 함 | 회차 총액 1.5억 원(3작) 이상일 때 개최, 미만이면 다음 달로. 견적이 작품당 실비 12%를 넘으면 최소 모집액 5,000만 원으로 상향 |
| 5 | 세계관 묶음(ETF형) 상품 | 확장 단계 | 상장 작품이 쌓이고 여러 기초자산을 묶은 상품이 허용된 뒤 |
| 6 | 투자 한도 계산 방식 | 청약 + 체결 매수 + 미체결 매수 (총매수 기준) | 법령은 '연간 순매수' 기준 → 매도분 차감 여부 |
| 7 | 마켓 운영 주체 | 내부 모의 거래소 (`InternalMockExchange`) | 실서비스는 장외거래소 API. `MarketGateway` 구현만 교체 |
| 8 | 가격제한폭·호가 단위 | 모의: 기준가 ±30%, 1원 단위 | 장외거래소 규정을 따름 |
| 9 | 리워드 후원(보상형) 수수료 8% | 설정값만 있음 (`reward_support_fee_bps`) | 보상형 후원은 외부 PG·크라우드펀딩 연동으로 처리 예정 |
| 10 | 배당 원 단위 절사 잔여 | 플랫폼 귀속 (`dividend_runs.residual`) | 다음 분기 이월 |
| 11 | 원천징수 절사 단위 | 원 단위 내림 | 세법상 10원 미만 절사 규칙 확인 |
| 12 | 한정 리워드 재고 | 청약 시점 선점 + 마감 시 먼저 청약한 순 | 배정 조각 수 순 |
| 13 | 투자성향 확인 | 5문항 합계로 3단계 (모의) | 제휴 증권사 적합성 기준을 따름 |

## 기획서와 다르게 해석한 부분

- **예치금 → 코인 전환**: 모의 예치금으로 실제 코인을 살 수 있으면 안 되므로 실거래 모드에서만 허용했다.
- **기준가(전일 종가)**: 모의 거래소는 24시간 거래라 **04:00 점검 시작 시점의 직전 체결가**로 정의했다 (`/admin/jobs/roll-reference-prices`).
- **배당 기준일 보유 수량**: 계산 시점이 아니라 기준일(분기 말일 24:00) 시점으로 거슬러 계산한다.
- **거래 수수료 원 미만**: 0.015%는 소액 거래에서 1원 미만이 되므로 원 단위로 내린다.
- **작가 매입가**: 배당 이력이 4분기보다 적으면 있는 분기의 합계 × 3을 쓴다. 배당 이력이 없으면 매입할 수 없다.
