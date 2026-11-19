from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models.enums import DividendStatus, FundingStatus, Mode, OrderSide, OrderStatus, RevenueSource
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
    price: int = Field(gt=0, description="지정가")
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
    fee_bps: int
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
class RevenueIn(BaseModel):
    funding_id: int
    period: str = Field(pattern=r"^\d{4}Q[1-4]$", examples=["2027Q1"])
    source: RevenueSource
    gross: int = Field(ge=0)
    deductions: int = Field(default=0, ge=0, description="인앱 수수료, 굿즈 원가·배송비 등")
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
    net_revenue: int
    holder_direct: int
    holder_pool: int
    creator_amount: int
    platform_amount: int
    residual: int
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
    maturity_date: datetime | None
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
    fee_bps: int
    fee: int
    total: int = Field(description="매수: 결제 예정액(금액+수수료) / 매도: 수령 예정액(금액-수수료)")
    price_band: PriceBand
    available_deposit: int
    available_units: int
    annual_remaining: int
    security_remaining: int
    can_place: bool
    reasons: list[str] = Field(description="주문 불가 사유 에러 코드 목록 (can_place=false 일 때)")
