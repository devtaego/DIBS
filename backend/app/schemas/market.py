from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import DividendStatus, FundingStatus, Mode, OrderSide, OrderStatus, RevenueSource, SecondaryIncome
from app.schemas.common import ORM


class SecurityListItem(BaseModel):
    funding_id: int
    work_id: int
    work_title: str
    status: FundingStatus
    unit_price: int = Field(description="공모가")
    reference_price: int | None
    last_price: int | None
    change_pct: float | None = Field(description="기준가 대비 등락률")


class BookLevel(BaseModel):
    price: int
    units: int
    orders: int


class PriceBand(BaseModel):
    min: int | None
    max: int | None


class OrderBookOut(BaseModel):
    bids: list[BookLevel]
    asks: list[BookLevel]
    reference_price: int | None
    last_price: int | None
    price_band: PriceBand


class TradeOut(ORM):
    id: int
    funding_id: int
    price: int
    units: int
    created_at: datetime


class OrderIn(BaseModel):
    funding_id: int
    side: OrderSide
    order_type: str = Field(default="LIMIT", pattern="^(LIMIT|MARKET)$",
                            description="LIMIT = 지정가 / MARKET = 시장가 (최우선 호가에서 체결, 남은 수량은 취소)")
    price: int | None = Field(default=None, gt=0, description="지정가 (시장가면 비움)")
    units: int = Field(gt=0)
    agree_risk_notice: bool


class OrderOut(ORM):
    id: int
    funding_id: int
    mode: Mode
    side: OrderSide
    price: int
    units: int
    remaining_units: int
    status: OrderStatus
    fee_ppm: int = Field(description="거래 수수료율 (100만분의 1, 0.015% = 150)")
    locked_amount: int
    trade_date: date
    created_at: datetime


class HoldingOut(BaseModel):
    funding_id: int
    work_title: str
    mode: Mode
    units: int
    locked_units: int
    avg_price: int
    last_price: int | None
    eval_amount: int
    pnl: int
    pnl_pct: float | None


# ── 배당 ──
class DirectCostsIn(BaseModel):
    """2차·해외 수익에서 뺄 수 있는 외부 직접비. DIBS 내부 인건비·비용은 항목이 없어 넣을 수 없다."""
    model_config = ConfigDict(extra="forbid")
    legal: int = Field(default=0, ge=0, description="법무 실비 (계약 검토 · 상표 등)")
    translation: int = Field(default=0, ge=0, description="번역 실비")
    localization: int = Field(default=0, ge=0, description="현지화 실비")


class RevenueIn(BaseModel):
    funding_id: int
    period: str = Field(pattern=r"^\d{4}Q[1-4]$", examples=["2027Q1"])
    source: RevenueSource
    gross: int = Field(ge=0)
    deductions: int = Field(default=0, ge=0, description="1차 매출의 공제액 (인앱 수수료 등). 2차·해외는 direct_costs로만")
    income_type: SecondaryIncome | None = Field(default=None, description="2차·해외 수입 종류 (SECONDARY_IP일 때 필수)")
    direct_costs: DirectCostsIn | None = Field(default=None, description="2차·해외 외부 직접비 (법무·번역·현지화만)")
    note: str | None = None
    evidence_url: str | None = None


class RevenueOut(ORM):
    id: int
    funding_id: int
    period: str
    source: RevenueSource
    gross: int
    deductions: int
    net: int
    income_type: str | None = None
    direct_costs: dict | None = None
    note: str | None
    created_at: datetime


class PeriodIn(BaseModel):
    period: str = Field(pattern=r"^\d{4}Q[1-4]$", examples=["2027Q1"])


class DividendRunOut(ORM):
    id: int
    funding_id: int
    period: str
    record_date: date
    pay_date: date
    net_revenue: int = Field(description="순매출 합계 (1차 연재 + 2차 IP·해외)")
    secondary_revenue: int = Field(default=0, description="그중 2차 IP·해외 순매출 (작가 40 / 투자자 25 / DIBS 35)")
    phase: str = Field(description="BEFORE_RECOUP | AFTER_RECOUP (v2.3 기본은 두 단계 모두 1차 60 / 30 / 10)")
    recouped_now: bool = Field(description="이 분기로 원금 회수 달성 → 다음 분기부터 회수 후 비율")
    holder_pool: int
    creator_amount: int
    platform_amount: int
    residual: int
    creator_escrow: int = Field(default=0, description="작가 몫 중 회수 전 유보분 (신탁, 회수·종료 때 작가에게)")
    escrow_released: int = Field(default=0, description="회수 달성으로 이번 지급 때 작가에게 푼 유보금")
    clawback_applied: int = Field(default=0, description="귀책 중단 반환 청구로 투자자에게 돌린 작가 몫")
    total_units: int
    per_unit_gross: float
    status: DividendStatus


class DividendPaymentOut(BaseModel):
    run_id: int
    funding_id: int
    work_title: str
    period: str
    pay_date: date
    status: DividendStatus
    units: int
    gross: int
    tax: int
    net: int


class SecurityDetailOut(SecurityListItem):
    """종목 상세 상단 (현재가·등락·발행 정보·배당·내 보유)."""

    security_code: str | None
    listed_at: datetime | None
    total_units: int
    price_band: PriceBand
    royalty_holder_bps: int
    cumulative_dividend_per_unit: float = Field(description="상장 후 누적 주당 배당금 (세전)")
    last_dividend: DividendRunOut | None
    volume_7d: int = Field(description="최근 7일 체결 조각 수 (유동성 확인용)")
    trades_7d: int
    dividend_4q_per_unit: float = Field(description="최근 4분기 주당 배당 합계 (세전)")
    price_to_dividend: float | None = Field(description="현재가 ÷ 최근 4분기 주당 배당. 배당 없으면 null")
    last_dist_per_token: float | None = Field(default=None, description="최근 확정 분기 토큰당 세전 배당 "
                                              "(지급 완료 분기만, 진행 중 분기 제외)")
    last_dist_period: str | None = Field(default=None, description="그 분기 (예: 2027Q3)")
    annual_dist_yield: float | None = Field(default=None, description="연 배당수익률 = 최근 확정 4분기 토큰당 배당 합 ÷ 현재가")
    recoup_phase: str = Field(description="BEFORE_RECOUP | AFTER_RECOUP")
    recoup_progress_pct: float = Field(description="누적 세전 분배금 ÷ 발행액")
    royalty_holder_after_bps: int
    buyback_enabled: bool = Field(default=False, description="작가 매입 옵션 선택 여부")
    buyback_price: int | None = Field(description="작가 매입가 (최근 4분기 보유자 분배금 × 3, 선택한 펀딩만)")
    terminate_due_at: datetime | None = Field(description="완결 후 12개월 (완결 전이면 null)")
    my_units: int | None = Field(default=None, description="로그인 시 내 보유 수량")
    my_avg_price: int | None = None


class CandleOut(BaseModel):
    date: date
    open: int
    high: int
    low: int
    close: int
    volume: int = Field(description="체결 조각 수")
    value: int = Field(description="거래대금 (원)")


class OrderPreviewOut(BaseModel):
    """주문 확인 시트: 수수료·총액·가능 여부를 서버 규칙으로 계산."""

    mode: Mode
    side: OrderSide
    price: int
    units: int
    gross: int
    fee_ppm: int = Field(description="0.015% = 150 (거래소·증권사 몫)")
    fee: int
    total: int = Field(description="매수: 결제 예정액(금액+수수료) / 매도: 수령 예정액(금액-수수료)")
    price_band: PriceBand
    available_deposit: int
    available_units: int
    annual_remaining: int
    security_remaining: int
    can_place: bool
    reasons: list[str] = Field(description="주문 불가 사유 에러 코드 목록 (can_place=false 일 때)")
