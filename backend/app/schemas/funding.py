from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models.enums import (
    FundingStatus,
    IssuanceStep,
    Mode,
    PayoutStatus,
    PayoutTrigger,
    SecurityType,
    SubscriptionStatus,
)
from app.schemas.common import ORM


class RewardTierIn(BaseModel):
    title: str
    description: str = ""
    min_units: int = Field(ge=1)
    limited_qty: int | None = Field(default=None, ge=1)
    requires_shipping: bool = False


class RewardTierOut(ORM, RewardTierIn):
    id: int


class FundingApplyIn(BaseModel):
    """창작자 펀딩 신청. 조각 단가·배분율 등 최종 조건은 운영자가 심사에서 확정한다."""

    target_units: int = Field(ge=1, examples=[1000])
    unit_price: int = Field(default=10_000, ge=1000)
    open_at: datetime
    close_at: datetime
    use_of_funds: str = Field(description="자금 사용 계획")
    reward_tiers: list[RewardTierIn] = Field(default_factory=list, max_length=5)


class FundingReviewIn(BaseModel):
    approve: bool
    note: str | None = None
    terms: dict = Field(default_factory=dict, examples=[{
        "unit_price": 10000, "target_units": 1000, "max_units_per_user": 300,
        "allocation_strategy": "PRO_RATA", "security_type": "UNDECIDED",
    }], description="덮어쓸 발행 조건 (REVIEWABLE_TERMS)")
    payout_schedule: list["PayoutIn"] | None = Field(default=None, description="작가 지급 일정. 생략 시 상장 시 100%")


class PayoutIn(BaseModel):
    bps: int = Field(ge=1, le=10000)
    trigger: PayoutTrigger
    milestone_note: str | None = None


class FundingTermsOut(ORM):
    security_type: SecurityType
    creator_bps: int
    issuance_cost_bps: int
    platform_fee_bps: int
    royalty_platform_bps: int
    royalty_creator_bps: int
    royalty_holder_bps: int
    allocation_strategy: str
    allocation_params: dict
    operating_period_months: int
    maturity_policy: str
    exclusive_months: int = Field(description="상장 후 DIBS 선공개 독점 기간(개월)")
    exclusive_until: datetime | None
    external_share_bps: int = Field(description="외부 진출 후 작가 몫 외부 연재 수익 중 배당 재원 비율")


class FundingOut(ORM):
    id: int
    work_id: int
    status: FundingStatus
    mode: Mode
    unit_price: int
    target_units: int
    target_amount: int
    max_units_per_user: int | None
    open_at: datetime | None
    close_at: datetime | None
    listed_at: datetime | None


class FundingProgress(BaseModel):
    requested_units: int
    raised_amount: int
    participants: int
    achievement_pct: float = Field(description="100% 초과 가능 (예: 842.0)")


class FundingDetailOut(FundingOut):
    work_title: str
    use_of_funds: str
    risk_note: str
    terms: FundingTermsOut
    reward_tiers: list[RewardTierOut]
    progress: FundingProgress
    lock_at: datetime | None = Field(description="이 시각부터 감액·취소 불가")
    maturity_date: datetime | None = Field(description="만기일 (상장 후 계산). 만기 시 상장폐지, 원금 상환 없음")


class SubscribeIn(BaseModel):
    units: int = Field(ge=1)
    reward_tier_id: int | None = None
    shipping: dict | None = Field(default=None, examples=[{"name": "홍길동", "phone": "010-0000-0000",
                                                         "zipcode": "06236", "address1": "서울 강남구 테헤란로 142",
                                                         "address2": "12층"}])
    agree_risk_notice: bool = Field(description="투자 위험 고지 동의 (true 필수)")
    agree_no_principal_return: bool = Field(
        default=False, description="만기 시 원금 상환 없음·예금자 보호 대상 아님 동의 (true 필수, v3.0)")


class SubscriptionPatch(BaseModel):
    units: int = Field(ge=1)
    reward_tier_id: int | None = None
    shipping: dict | None = None


class SubscriptionOut(ORM):
    id: int
    funding_id: int
    user_id: int
    units: int
    status: SubscriptionStatus
    allocated_units: int | None
    requested_tier_id: int | None
    assigned_tier_id: int | None
    first_subscribed_at: datetime


class AllocationLine(BaseModel):
    subscription_id: int
    user_id: int
    requested: int
    allocated: int


class CloseOut(BaseModel):
    status: FundingStatus
    requested_units: int
    target_units: int
    allocations: list[AllocationLine]


class IssuanceRequestIn(BaseModel):
    broker_name: str | None = Field(default=None, description="제휴 증권사")


class IssuanceAdvanceIn(BaseModel):
    step: IssuanceStep
    security_code: str | None = None
    trustee: str | None = None
    listing_date: date | None = None
    note: str | None = None


class IssuanceOut(ORM):
    id: int
    funding_id: int
    step: IssuanceStep
    broker_name: str | None
    security_code: str | None
    trustee: str | None
    listing_date: date | None
    failed_reason: str | None
    history: list


class ReasonIn(BaseModel):
    reason: str


class SuspendIn(BaseModel):
    suspended: bool
    reason: str | None = None


class PayoutOut(ORM):
    id: int
    funding_id: int
    seq: int
    bps: int
    trigger: PayoutTrigger
    milestone_note: str | None
    status: PayoutStatus
    amount: int | None


FundingReviewIn.model_rebuild()


class FundingCardOut(FundingOut):
    """홈·펀딩 목록 카드용."""

    work_title: str
    cover_url: str | None
    progress: FundingProgress
    days_left: int | None = Field(description="모집 중일 때 마감까지 남은 일수 (D-day)")


class StudioFundingOut(FundingCardOut):
    review_note: str | None


class MySubscriptionOut(SubscriptionOut):
    """내 증권 > 청약 내역 탭."""

    work_title: str
    unit_price: int
    funding_status: FundingStatus
    close_at: datetime | None
    requested_tier_title: str | None
    assigned_tier_title: str | None
    tracking_carrier: str | None
    tracking_no: str | None


class ShipmentOut(BaseModel):
    subscription_id: int
    user_id: int
    nickname: str
    tier_id: int
    tier_title: str
    allocated_units: int
    shipping: dict | None
    tracking_carrier: str | None
    tracking_no: str | None
    shipped_at: datetime | None


class ShipmentIn(BaseModel):
    carrier: str = Field(examples=["CJ대한통운"])
    tracking_no: str = Field(examples=["123456789012"])


class RoyaltyLine(BaseModel):
    period: str
    pay_date: date
    net_revenue: int
    creator_amount: int
    status: str


class SettlementOut(BaseModel):
    funding_id: int
    work_title: str
    funding_status: FundingStatus
    payouts: list[PayoutOut]
    royalties: list[RoyaltyLine]
    paid_total: int = Field(description="지급 완료 합계 (펀딩 지급분 + 저작권료)")


class BreakevenLine(BaseModel):
    goal: str
    holder_dividend_per_year: int
    net_revenue_per_year: int
    paid_unlocks_per_month: int
    buyers_per_episode: int


class BreakevenOut(BaseModel):
    """손익분기 독자 규모 공시 (청약 화면). 1년차 DIBS 안 유료 회차 매출만으로 계산한 보수적 수치."""

    funding_id: int
    target_amount: int
    price_coin: int
    monthly_episodes: int
    inapp_fee_bps: int
    royalty_holder_bps: int
    lines: list[BreakevenLine]


class DiscontinueOut(BaseModel):
    cancelled_payout_amount: int
    distributed: int
    holders: int
