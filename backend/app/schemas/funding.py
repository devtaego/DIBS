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
    royalty_platform_bps: int = Field(description="회수 전 DIBS 몫 (기본 25%)")
    royalty_creator_bps: int = Field(description="회수 전 작가 몫 (기본 30%)")
    royalty_holder_bps: int = Field(description="회수 전 투자자 몫 (기본 45%)")
    royalty_platform_after_bps: int = Field(description="회수 후 DIBS 몫 (기본 25%)")
    royalty_creator_after_bps: int = Field(description="회수 후 작가 몫 (기본 40%)")
    royalty_holder_after_bps: int = Field(description="회수 후 투자자 몫 (기본 35%)")
    allocation_strategy: str
    allocation_params: dict = Field(description="equal_ratio_bps(균등 20%), early_reader_bps(초기 독자 우선 10%)")
    exclusive_months: int = Field(description="상장 후 DIBS 선공개 독점 기간(개월)")
    exclusive_until: datetime | None
    external_share_bps: int = Field(description="독점 종료 후 외부 연재·영상화 수익 중 작가 몫에서 순매출에 넣는 비율")


class RecoupOut(BaseModel):
    """회수 우선 배분 진행 상황."""

    phase: str = Field(description="BEFORE_RECOUP | AFTER_RECOUP")
    recouped_period: str | None
    cumulative_holder_gross: int = Field(description="누적 세전 분배금 (투자자 전체)")
    issuance_amount: int
    progress_pct: float
    holder_bps_now: int
    holder_bps_before: int
    holder_bps_after: int


class TerminationOut(BaseModel):
    completed_at: datetime | None
    terminate_due_at: datetime | None = Field(description="완결 후 3년")
    low_revenue_threshold: int = Field(description="분기 순매출이 이보다 작으면 저매출 분기 (발행액 0.5%)")
    low_revenue_streak: int
    eligible: bool
    reason: str | None
    buyback_price: int | None = Field(description="작가 매입가 = 최근 4분기 보유자 분배금 합계 × 3")


class FundingGateOut(BaseModel):
    """펀딩 개설 조건과 목표 금액 상한 (v4.0)."""

    work_id: int
    target_amount: int
    pilot_readers_4w: int
    readers_needed_for_4y: int
    gate_threshold: int = Field(description="필요 열람자의 50%")
    passes_gate: bool
    expected_monthly_readers: int
    target_cap: int = Field(description="예상 월 투자자 몫(세후) × 48개월")
    within_cap: bool
    enforced: bool


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
    offering_round: str | None = Field(default=None, description="공모 회차 (같은 달 공모 작품의 신고·검토 공동 진행)")


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
    per_user_cap_units: int = Field(description="1인 청약 한도 (3,000만 원과 발행액 5% 중 작은 금액)")
    risk_grade: str = Field(default="매우 높은 위험")
    recoup: RecoupOut
    termination: TerminationOut | None = Field(description="상장 후에만 (만기 없음, 종료 규칙)")


class SubscribeIn(BaseModel):
    units: int = Field(ge=1)
    reward_tier_id: int | None = None
    shipping: dict | None = Field(default=None, examples=[{"name": "홍길동", "phone": "010-0000-0000",
                                                         "zipcode": "06236", "address1": "서울 강남구 테헤란로 142",
                                                         "address2": "12층"}])
    agree_risk_notice: bool = Field(description="투자 위험 고지 동의 (true 필수)")
    agree_termination_rule: bool = Field(
        default=False, description="만기 없음·원금 상환 없음·종료 규칙·작가 매입 옵션 동의 (true 필수, v4.0)")


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
    early_reader: bool = Field(default=False, description="모집 시작 전 찜한 초기 독자 (우선 균등 배정 대상)")


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
    monthly_readers: int = Field(description="결제율 가정으로 환산한 필요 월 열람자")


class BreakevenOut(BaseModel):
    """손익분기 독자 규모 공시 (청약 화면). 회수 전 투자자 몫(세후)으로 4년·2년 안에 원금을 돌려받는 데 필요한 규모."""

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
