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
    default_unit_price: int = 10_000
    min_funding_days: int = 7
    max_funding_days: int = 60
    min_target_amount: int = 10_000_000  # v3.0: 발행 고정비를 고려해 100만 → 1,000만 원
    max_target_amount: int = 500_000_000
    subscription_lock_minutes: int = 60  # 마감 N분 전부터 감액·취소 불가

    # 모금액 배분 (bps, 1bps = 0.01%)
    creator_bps: int = 8000
    issuance_cost_bps: int = 1000
    platform_fee_bps: int = 1000

    # v3.0 상품 구조
    operating_period_months: int = 36  # 운용 기간 3년
    exclusive_months: int = 12  # 상장 후 DIBS 선공개 독점 기간 (B안)
    external_share_bps: int = 2000  # 외부 진출 후 작가 몫 외부 연재 수익 중 배당 재원 비율
    fee_reserve_bps: int = 2000  # 거래 수수료 중 종목 배당 재원 적립 비율
    default_allocation_strategy: str = "EQUAL_THEN_PRO_RATA"
    default_equal_ratio_bps: int = 2000  # 목표의 20% 균등 배정
    # 작가 분할 지급 기본 일정 (bps, trigger, 마일스톤 설명)
    default_payout_schedule: list = [
        {"bps": 4000, "trigger": "ON_LISTED", "milestone_note": "상장"},
        {"bps": 3000, "trigger": "MILESTONE", "milestone_note": "10화 연재"},
        {"bps": 3000, "trigger": "MILESTONE", "milestone_note": "20화 연재 또는 완결"},
    ]

    # 저작권료 배분 (bps)
    royalty_platform_bps: int = 3000
    royalty_creator_bps: int = 3000
    royalty_holder_bps: int = 4000

    # ── 마켓 ──
    price_limit_bps: int = 3000  # 기준가 ±30%
    buy_fee_bps: int = 100
    buy_fee_bulk_bps: int = 80
    buy_fee_bulk_min_units: int = 5
    sell_fee_bps: int = 100
    maintenance_start: str = "04:00"  # KST
    maintenance_end: str = "04:30"

    # ── 투자 한도 (원) ──
    annual_limit_general: int = 10_000_000
    per_security_limit_general: int = 3_000_000
    annual_limit_qualified: int = 30_000_000
    per_security_limit_qualified: int = 10_000_000

    # ── 배당 ──
    dividend_tax_bps: int = 1540  # 배당소득세 14% + 지방소득세 1.4%
    inapp_fee_bps: int = 3000  # 유료 회차 코인 매출에서 공제하는 인앱결제 수수료
    dividend_pay_day: int = 10  # 분기 종료 다음 달 N일


settings = Settings()
