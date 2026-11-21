"""전역 설정.

여기 있는 정책값은 '기본값'일 뿐이다. 작품(펀딩)별로 달라질 수 있는 값은
Funding 테이블 컬럼으로 복사되어 저장되고, 운영자가 심사 시 덮어쓸 수 있다.
기획이 확정되지 않은 항목은 docs/OPEN_DECISIONS.md 에 정리되어 있다.
"""
import os

from pydantic import BaseModel


def _env_bool(name: str, default: bool) -> bool:
    return os.getenv(name, str(default)).lower() in ("1", "true", "yes")


class Settings(BaseModel):
    app_name: str = "DIBS API"
    env: str = os.getenv("DIBS_ENV", "dev")  # dev | test | prod
    database_url: str = os.getenv("DIBS_DATABASE_URL", "sqlite:///./dibs.db")

    # 인증 (개발용 JWT. 실서비스는 본인확인기관 + OAuth로 교체)
    jwt_secret: str = os.getenv("DIBS_JWT_SECRET", "dev-only-secret-change-me-in-production-32b")
    jwt_alg: str = "HS256"
    jwt_exp_minutes: int = 60 * 24

    # 모의투자 / 실거래 스위치 (기본: 모의투자)
    trading_mode: str = os.getenv("DIBS_TRADING_MODE", "MOCK")  # MOCK | LIVE
    live_trading_enabled: bool = _env_bool("DIBS_LIVE_ENABLED", False)

    # ── 펀딩(청약) 기본값 ──
    # v2.2 조정값 (docs/DECISIONS-v2.2.md): 1조각 = 1,000원. 펀딩은 1,000원 단위·최소 1,000원이라 소수 조각이 없다
    default_unit_price: int = 1_000
    min_funding_days: int = 7
    max_funding_days: int = 60
    min_target_amount: int = 10_000_000  # v5.0: 작품당 1,000만 원 이상 (월 공모 회차로 발행 실비를 나눔)
    max_target_amount: int = 500_000_000  # 작품당 상한 (실제 상한은 데이터 기반 목표 금액 상한)
    # 1인 청약 한도 (v4.0, 금융위 예시): 3,000만 원과 발행액 5% 중 작은 금액
    max_subscription_amount: int = 30_000_000
    max_subscription_bps: int = 500
    subscription_lock_minutes: int = 60  # 마감 N분 전부터 감액·취소 불가

    # 모금액 배분 (bps, 1bps = 0.01%) — v2.2 조정값: 작가 80 / 발행 실비 12 / 최소 유보금 5 / DIBS 운영비 3
    # 기획서 0-4의 '작가 80 · 발행 측 20'과 1-3의 'DIBS 펀딩 운영비 3%'를 함께 만족한다. 유보금은 신탁 보관
    creator_bps: int = 8000
    issuance_cost_bps: int = 1200
    reserve_bps: int = 500
    platform_fee_bps: int = 300
    # 창작자 토큰: 발행량의 5%를 창작자에게 배정하고 상장 후 12개월 보호예수 (기획서 1-3의 ○%·○개월 확정값)
    creator_token_bps: int = 500
    creator_lockup_months: int = 12
    # 종목별 1인 보유 한도: 발행량의 10% (기획서 3-5-1·3-7-4 검토안, 청약과 마켓 매수에 함께 적용)
    max_holding_bps: int = 1000

    # v5.0 상품 구조: 시즌 단위. 시즌 연재(약 12개월) + 완결 후 12개월이 지나면 권리 소멸
    # v2.2: 고정 운용 기간·예정 만기 없이 발행 → 기간 만료·저매출 종료 판정을 끈다 (작가 매입·운영자 상장폐지만 남음)
    fixed_term_enabled: bool = False
    exclusive_months: int = 12  # 상장 후 DIBS 선공개 독점 기간
    external_share_bps: int = 2000  # 독점 종료 후 외부 연재·영상화 수익 중 작가 몫의 20%를 순매출에 포함
    termination_after_completion_months: int = 12  # 완결 후 12개월이면 권리 종료
    low_revenue_bps: int = 50  # 분기 순매출이 발행액의 0.5% 미만이면 '저매출 분기'
    low_revenue_quarters: int = 2  # 저매출 분기가 연속 2번이면 권리 종료
    buyback_multiple: int = 3  # 작가 매입가 = 최근 4분기 보유자 분배금 합계 × 3 (펀딩별 선택 사항)
    default_allocation_strategy: str = "EQUAL_THEN_PRO_RATA"
    default_equal_ratio_bps: int = 2000  # 발행량의 20% 균등 배정
    default_early_reader_bps: int = 1000  # 그중 절반(발행량의 10%)은 초기 독자 우선
    # 초기 독자 자격: 모집 시작 7일 전까지 찜 + 파일럿 완독 1회 이상 + 본인인증 계정 (공짜 찜 남용 방지)
    # 또는 같은 작품 이전 시즌 보유자 (다음 시즌 우선 청약)
    early_reader_dib_days_before: int = 7

    # 발행 전 콘텐츠 (v4.0)
    pilot_free_episodes: int = 3  # 파일럿 1~3화 무료
    # 씨앗(화면 표기) = 코인 100원. 장부는 원 단위 정수 그대로 두고 응답에 씨앗 개수를 함께 준다 (1화 300원 = 씨앗 3개)
    seed_unit_won: int = 100
    bonus_coin_expiry_days: int = 90  # 보너스 씨앗(출석·묶음 보너스·이벤트) 유효기간
    paid_coin_expiry_days: int = 365 * 5  # 유료 충전분은 5년 (상사채권 소멸시효)
    pg_refund_days: int = 7  # PG 충전분: 7일 안에 한 번도 안 썼으면 결제 취소
    iap_markup_bps: int = 1000  # 인앱결제 가격 = 지급 금액 × 110% (스토어 수수료 보전, 기획서 3-4-3)
    # 씨앗 묶음 (화면 08 씨앗 구매): 10개 1,000원 / 30개 3,000원 / 55개 5,000원(보너스 5개)
    coin_packages: list = [
        {"id": "seed10", "seeds": 10, "bonus_seeds": 0, "price": 1_000},
        {"id": "seed30", "seeds": 30, "bonus_seeds": 0, "price": 3_000},
        {"id": "seed55", "seeds": 50, "bonus_seeds": 5, "price": 5_000},
    ]
    preview_free_after_days: int = 21  # 유료 미리보기는 공개 21일 뒤 무료
    default_preview_price_coin: int = 300
    pre_issuance_creator_bps: int = 7000  # 발행 전 순매출 작가 70 / DIBS 30
    reward_support_fee_bps: int = 800  # 리워드 후원 수수료 8%

    # 펀딩 개설 조건·목표 금액 상한 (v5.0: 유료 팬 기준)
    enforce_funding_gate: bool = _env_bool("DIBS_ENFORCE_GATE", False)  # 시연 데이터가 작아 기본 꺼짐
    gate_ratio_bps: int = 10000  # 파일럿 4주 유료 구매자 ≥ 필요 유료 팬의 100%
    season_months: int = 12  # 시즌 연재 기간 (매출 수준 100%)
    tail_months: int = 12  # 완결 후 권리 유지 기간
    tail_level_bps: int = 4000  # 완결 직후 매출 = 연재 때의 40%
    tail_decay_bps_per_year: int = 3000  # 완결 후 매출이 1년에 30%씩 줄어듦
    cap_safety_bps: int = 7000  # 목표 금액 상한 = 예상 투자자 몫(세후, 상품 기간 전체) × 70%
    assumed_pay_rate_bps: int = 1500  # 참고용: 열람자 중 결제 비율 15% (네이버 플랫폼 평균, 작품 단위에는 상한값)
    assumed_monthly_episodes: int = 4  # 유료 팬 1명이 한 달에 구매하는 미리보기 회차
    # 작가 분할 지급 기본 일정 (bps, trigger, 마일스톤 설명)
    # episodes_bps = 약정 회차 중 이만큼 연재되면 자동 지급 (5000 = 절반, 10000 = 약정 회차 완결)
    default_payout_schedule: list = [
        {"bps": 4000, "trigger": "ON_LISTED", "milestone_note": "상장"},
        {"bps": 3000, "trigger": "MILESTONE", "milestone_note": "약정 회차 절반 연재", "episodes_bps": 5000},
        {"bps": 3000, "trigger": "MILESTONE", "milestone_note": "약정 회차 완결", "episodes_bps": 10000},
    ]

    # ── 연재 약정과 연재 위험 ──
    default_committed_episodes: int = 40  # 시즌 약정 회차 (주 1회 약 10개월)
    min_committed_episodes: int = 20
    monthly_episode_quota: int = 4  # 기한 계산 기준: 한 달 4화
    hiatus_limit_weeks: int = 8  # 미리 알린 휴재는 시즌 중 누적 8주까지 기한에서 빼 준다
    buffer_bps: int = 2500  # 공모 전 비축분 ≥ 약정 회차의 25%
    enforce_buffer: bool = _env_bool("DIBS_ENFORCE_BUFFER", False)  # 시연 데이터 규모 때문에 기본 꺼짐, 운영에서 켬
    delay_warning_months: int = 1  # 한 달치(4화) 이상 밀리면 경고·공시
    delay_breach_months: int = 3  # 석 달치(12화) 밀리면 귀책 중단
    min_term_after_listing_months: int = 24  # 조기 완결해도 상장 후 24개월까지는 권리 유지
    clawback_bps: int = 5000  # 귀책 중단: 이미 받은 작가 지급금의 50% 반환
    # v2.2: 작가 몫 60%를 그대로 지급 (회수 전 유보 없음). 귀책 중단 대비는 모금액의 최소 유보금 5%가 맡는다
    creator_escrow_bps: int = 0

    # 배당 재원(순매출) 배분 (bps) — v2.2: 작가 60 / 투자자 30 / DIBS 10 고정 (웹툰 업계 작가 몫 60~70% 범위)
    royalty_platform_bps: int = 1000
    royalty_creator_bps: int = 6000
    royalty_holder_bps: int = 3000
    # 회수 후 배분: v2.2는 회수 전후 전환 없음 (같은 값). 펀딩별로 다르게 심사할 때만 바꾼다
    royalty_platform_after_bps: int = 1000
    royalty_creator_after_bps: int = 6000
    royalty_holder_after_bps: int = 3000

    # ── 증권사 연계 (B안: 읽기는 DIBS, 청약·계좌·보유는 증권사) ──
    # INTERNAL = 앱 안 모의 청약 화면(증권사 화면 대체, 시연용) / BROKER = 증권사 청약 화면으로 넘김
    subscription_channel: str = os.getenv("DIBS_SUBSCRIPTION_CHANNEL", "INTERNAL")
    broker_name: str = os.getenv("DIBS_BROKER_NAME", "키움증권")
    broker_code: str = "KIWOOM"
    broker_shared_secret: str = os.getenv("DIBS_BROKER_SECRET", "dev-broker-secret-change-me")
    broker_deeplink_base: str = os.getenv("DIBS_BROKER_DEEPLINK", "kiwoom-mock://offering")
    handoff_ttl_minutes: int = 10
    partner_coupon_coin: int = 20_000  # 계좌 개설 쿠폰: 증권사가 신규 계좌 고객에게 주는 DIBS 코인
    first_time_cap_amount: int = 100_000  # 투자 경험이 없다고 답한 고객의 1인 청약 한도
    enable_mock_broker: bool = _env_bool("DIBS_ENABLE_MOCK_BROKER", True)  # /dev/mock-kiwoom (운영에서 끔)
    withdraw_min: int = 1_000  # 최소 출금액 (기획서 3-4-4)
    withdraw_auto_limit: int = 10_000_000  # 1회 이 금액을 넘으면 운영자 승인 후 처리
    account_change_hold_hours: int = 24  # 계좌 변경 직후 출금 금지 시간
    adult_age: int = 19  # 투자 가능(L3)·19세 작품 열람 기준 나이
    mock_instant_withdrawal: bool = True  # 모의 모드: 출금은 연결된 키움 계좌로 바로 (운영자 승인 생략)

    # ── 마켓 ──
    # 모의 거래소 규칙. 실제 가격제한폭·거래시간은 장외거래소 규정을 따른다
    price_limit_bps: int = 3000  # 기준가 ±30%
    # 거래 수수료 0.015% (거래소·증권사 몫, DIBS 수입 아님). ppm = 100만분의 1
    trade_fee_ppm: int = 150
    maintenance_start: str = "04:00"  # KST
    maintenance_end: str = "04:30"

    # ── 투자 한도 (원) ──
    # 일반투자자: 장외거래소 연 순매수 1억 원, 종목당 3,000만 원 (청약 1인 한도와 같은 기준)
    annual_limit_general: int = 100_000_000
    per_security_limit_general: int = 30_000_000
    annual_limit_qualified: int = 1_000_000_000
    per_security_limit_qualified: int = 100_000_000

    # ── 배당 ──
    dividend_tax_bps: int = 1540  # 배당소득세 14% + 지방소득세 1.4%
    inapp_fee_bps: int = 3000  # 유료 회차 코인 매출에서 공제하는 인앱결제 수수료
    dividend_pay_day: int = 10  # 분기 종료 다음 달 N일


settings = Settings()
