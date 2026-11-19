# 기획 확정이 필요한 항목

백엔드는 아래 항목을 **설정값이나 교체 가능한 구조**로 만들어 두었습니다. 기획 팀이 결정하면 코드 구조는 그대로 두고 값이나 구현만 바꾸면 됩니다.

> **2026-11-19:** 기획안 v3.0의 '제안' 값을 기본값으로 반영했어요 (팀 확정 전). 아래 표의 '현재 기본값'이 v3.0 기준입니다.

| # | 항목 | 현재 기본값 (기획안 v2.0) | 대안·검토 포인트 | 바꿀 곳 |
|---|---|---|---|---|
| 1 | **배정 방식** | v3.0: `EQUAL_THEN_PRO_RATA` 균등 20% + 비례 | `PRO_RATA`(비례만, 0조각 가능). 균등 비율은 데이터 분석 시뮬레이션으로 확정 | `fundings.allocation_strategy`, `allocation_params.equal_ratio_bps` — 이미 구현·테스트됨 |
| 2 | **작가 지급 시점** | v3.0: 상장 40% · 10화 30% · 20화(완결) 30% | 마일스톤 기준은 창작자 인터뷰로 확인. 연재 중단 시 미지급분은 주주에게 분배 (구현됨) | 펀딩 심사 API의 `payout_schedule` — 이미 구현됨 (`MILESTONE` 은 운영자가 `/payouts/{seq}/pay`) |
| 3 | **운용 기간 만료 처리** | v3.0: 3년, 만기 시 상장폐지·원금 상환 없음 (`DELIST_NO_REDEMPTION`, 구현됨) | 연장 여부 | `services/funding.py::mature` |
| 4 | **증권 유형** | 미정 (`security_type = UNDECIDED`) | 투자계약증권 / 비금전신탁수익증권 → 세금(배당소득 여부)·발행 구조가 달라짐 | `fundings.security_type` |
| 5 | **마켓 운영 주체** | 내부 모의 상대매매 (`InternalMockExchange`) | 발행·유통 분리 원칙상 실서비스는 제휴 장외거래소 연동 가능성이 큼 | `services/market/gateway.py` 의 `MarketGateway` 구현만 교체 |
| 6 | **투자 한도 계산 방식** | 올해 청약 + 체결 매수 + 미체결 매수 (총매수 기준) | 법령안은 '연간 순매수' 기준 → 매도분 차감 여부 결정 | `services/policy.py::investment_usage` |
| 7 | 투자 한도 금액 | 연 1,000만 원 / 종목당 300만 원 (소득요건 3,000만 / 1,000만) | 법정 한도(장외거래소별 연간 순매수 1억)보다 보수적으로 둔 이유를 기획안에 명시 | `core/config.py` |
| 8 | 펀딩 최소 모집액 | v3.0: 1,000만 원 | 발행 비용(고정비) 대비 소액 펀딩 성립 여부 | `core/config.py::min_target_amount` |
| 9 | 배당 원 단위 절사 잔여 | 플랫폼 귀속 (`dividend_runs.residual`) | 다음 분기 이월 | `services/dividend.py::pay` |
| 10 | 원천징수 절사 단위 | 원 단위 내림 | 실제 세법상 10원 미만 절사 규칙 확인 | `services/dividend.py::calculate` |
| 11 | 가격 호가 단위 | 없음 (1원 단위) | 100원 단위 등 | `services/market/mock_exchange.py::place_order` |
| 12 | 유료 회차 인앱결제 수수료 공제율 | 30% | 실제 스토어 수수료·PG 수수료 | `core/config.py::inapp_fee_bps` |
| 13 | 한정 리워드 재고 | 청약 시점 선점 + 마감 시 먼저 청약한 순 확정 | 배정 조각 수 순 | `services/funding.py::_assign_rewards` |
| 14 | 취소 후 재청약 | 허용 (동점 순위는 재청약 시각으로 새로 매김) | 마감 1시간 전 재청약 금지 | `services/funding.py::subscribe` |

## 기획안과 다르게 해석한 부분

- **예치금 → 코인 전환**: 기획안 지갑 메뉴에 있지만, 모의 예치금으로 실제 코인을 살 수 있으면 안 되므로 **실거래 모드에서만** 허용했습니다.
- **기준가(전일 종가)**: 24시간 거래라 '전일 종가'가 모호해서 **04:00 점검 시작 시점의 직전 체결가**로 정의했습니다 (`/admin/jobs/roll-reference-prices`).
- **배당 기준일 보유 수량**: 계산 시점의 보유 수량이 아니라 **기준일(분기 말일 24:00) 시점**으로 거슬러 계산합니다 (기준일 이후 체결 역산).
| 15 | 선공개 독점 기간 | v3.0: 상장 후 12개월 (`exclusive_months`) | 기간 조정 | `core/config.py` |
| 16 | 외부 연재 수익 반영 비율 | v3.0: 작가 몫의 20%, 전액 주주 몫 (`external_share_bps`) | 비율, 증빙 방식 | `services/dividend.py::add_revenue` |
| 17 | 거래 수수료 적립 | v3.0: 수수료의 20%를 종목 배당 재원으로 (`fee_reserve_bps`) | 비율 | `core/config.py` |
| 18 | 투자성향 확인 | 5문항 1~4점 합계로 3단계 (모의) | 실제 적합성 기준은 제휴 증권사 기준을 따름 | `api/me.py::risk_profile` |
