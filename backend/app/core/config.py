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
    min_target_amount: int = 10_000_000  # v5.0: 작품당 1,000만 원 이상 (월 공모 회차로 발행 실비를 나눔)
    max_target_amount: int = 500_000_000  # 작품당 상한 (실제 상한은 데이터 기반 목표 금액 상한)
    # 1인 청약 한도 (v4.0, 금융위 예시): 3,000만 원과 발행액 5% 중 작은 금액
    max_subscription_amount: int = 30_000_000
    max_subscription_bps: int = 500
    subscription_lock_minutes: int = 60  # 마감 N분 전부터 감액·취소 불가

    # 모금액 배분 (bps, 1bps = 0.01%) — v5.0: 작가 85 / 발행 실비 12 / DIBS 3
    # DIBS 발행 수수료를 실비 수준으로 낮춰 '많이 발행할수록 버는 구조'를 피한다. DIBS는 주로 매출 배분 25%로 번다
    creator_bps: int = 8500
    issuance_cost_bps: int = 1200
    platform_fee_bps: int = 300

    # v5.0 상품 구조: 시즌 단위. 시즌 연재(약 12개월) + 완결 후 12개월이 지나면 권리 소멸
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
    default_payout_schedule: list = [
        {"bps": 4000, "trigger": "ON_LISTED", "milestone_note": "상장"},
        {"bps": 3000, "trigger": "MILESTONE", "milestone_note": "10화 연재"},
        {"bps": 3000, "trigger": "MILESTONE", "milestone_note": "20화 연재 또는 완결"},
    ]

    # 배당 재원(순매출) 배분 (bps) — v4.0 회수 우선 배분
    # 회수 전: 작가 30 / 투자자 45 / DIBS 25
    royalty_platform_bps: int = 2500
    royalty_creator_bps: int = 3000
    royalty_holder_bps: int = 4500
    # 회수 후 (누적 세전 분배금 ≥ 발행액이 된 다음 분기부터): 작가 40 / 투자자 35 / DIBS 25
    royalty_platform_after_bps: int = 2500
    royalty_creator_after_bps: int = 4000
    royalty_holder_after_bps: int = 3500

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
