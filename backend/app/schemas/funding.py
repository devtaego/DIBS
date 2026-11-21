from datetime import date, datetime
from typing import Literal

from app.core.config import settings
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

    target_units: int = Field(ge=1, examples=[10000])
    unit_price: int = Field(default_factory=lambda: settings.default_unit_price, ge=1000,
                            description="1조각 가격 (v2.2 기본 1,000원 = 펀딩 1,000원 단위)")
    open_at: datetime
    close_at: datetime
    use_of_funds: str = Field(description="자금 사용 계획")
    buyback_enabled: bool = Field(default=False, description="작가 매입 옵션 (선택 사항)")
    reward_tiers: list[RewardTierIn] = Field(default_factory=list, max_length=5)


class FundingReviewIn(BaseModel):
    approve: bool
    note: str | None = None
    terms: dict = Field(default_factory=dict, examples=[{
        "unit_price": 1000, "target_units": 10000, "max_units_per_user": 500,
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
    reserve_bps: int = Field(default=0, description="최소 유보금 (기본 5%, 신탁 보관)")
    creator_token_bps: int = Field(default=0, description="창작자 토큰 (발행량의 5%)")
    creator_lockup_months: int = Field(default=0, description="창작자 토큰 보호예수 (상장 후 12개월)")
    royalty_platform_bps: int = Field(description="순매출 중 DIBS 몫 (기본 10%)")
    royalty_creator_bps: int = Field(description="순매출 중 작가 몫 (기본 60%)")
    royalty_holder_bps: int = Field(description="순매출 중 투자자 몫 (기본 30%)")
    royalty_platform_after_bps: int = Field(description="회수 후 DIBS 몫 (v2.3 기본: 회수 전과 같음)")
    royalty_creator_after_bps: int = Field(description="회수 후 작가 몫 (v2.3 기본: 회수 전과 같음)")
    royalty_holder_after_bps: int = Field(description="회수 후 투자자 몫 (v2.3 기본: 회수 전과 같음)")
    allocation_strategy: str
    allocation_params: dict = Field(description="equal_ratio_bps(균등 20%), early_reader_bps(v2.3 기본 0: 찜 우선권 없음)")
    exclusive_months: int = Field(description="상장 후 DIBS 선공개 독점 기간(개월)")
    exclusive_until: datetime | None
    buyback_enabled: bool = Field(default=False, description="작가 매입 옵션 선택 여부")
    external_share_bps: int = Field(description="독점 종료 후 외부 플랫폼 연재 정산금 중 순매출에 넣는 비율 (v2.3 기본 10000 = 전액)")


class RecoupOut(BaseModel):
    """회수 우선 배분 진행 상황."""

    phase: str = Field(description="BEFORE_RECOUP | AFTER_RECOUP")
    recouped_period: str | None
    cumulative_holder_gross: int = Field(description="누적 세전 분배금 (투자자 전체)")
    cumulative_holder_net: int = Field(description="원천징수 후 누적 분배금 — 회수 판정 기준")
    issuance_amount: int
    progress_pct: float
    holder_bps_now: int
    holder_bps_before: int
    holder_bps_after: int


class TerminationOut(BaseModel):
    completed_at: datetime | None
    terminate_due_at: datetime | None = Field(description="완결 후 12개월")
    low_revenue_threshold: int = Field(description="분기 순매출이 이보다 작으면 저매출 분기 (발행액 0.5%)")
    low_revenue_streak: int
    eligible: bool
    reason: str | None
    buyback_enabled: bool = Field(description="작가 매입 옵션 선택 여부 (선택 사항)")
    buyback_price: int | None = Field(description="작가 매입가 = 최근 4분기 보유자 분배금 합계 × 3 (선택한 펀딩만)")


class ScenarioOut(BaseModel):
    fan_ratio: float = Field(description="파일럿 유료 팬 대비 실제 유료 팬 비율")
    multiple: float | None = Field(description="상품 기간 총회수 배수 (세후)")
    payback_months: int | None = Field(description="원금 회수 달 (세후, 없으면 기간 안에 회수 못 함)")


class FundingIndicatorsOut(BaseModel):
    """발행 전 투자 지표 카드 (청약 화면). 기간이 짧아 연 수익률 대신 배수와 회수 기간만 보여 준다."""

    funding_id: int
    dibs_total: int
    dibs_7d: int = Field(description="최근 7일 찜 (찜 속도)")
    pilot_readers_4w: int = Field(description="최근 4주 파일럿 열람자 (참고)")
    pilot_read_through: float | None = Field(description="파일럿 연독률 (마지막 무료 회차 완독 ÷ 1화 완독)")
    pilot_paying_fans_4w: int = Field(description="최근 4주 유료 미리보기 구매자 (상장 전에는 0)")
    expected_paying_fans: int = Field(description="월 유료 팬 추정 (상한·시나리오 기준)")
    fans_basis: str = Field(description="READERS_X_PAY_RATE = 파일럿 4주 열람자 × 가정 결제율 15% (상장 전 유료 미리보기 없음) | PAID_PILOT = 실제 유료 구매자")
    paying_fans_needed: int = Field(description="이 목표 금액에 필요한 월 유료 팬")
    gate_threshold: int
    passes_gate: bool
    target_cap: int
    season_months: int
    tail_months: int
    scenarios: dict[str, ScenarioOut] = Field(description="downside 0.4 · conservative 0.7 · base 1.0 · optimistic 1.5")
    per_user_cap_amount: int = Field(description="1인 청약 한도 (3,000만 원과 발행액 5% 중 작은 금액)")
    per_user_max_loss_downside: int = Field(description="한도까지 청약했을 때 downside 시나리오 손실액")
    note: str


class FundingGateOut(BaseModel):
    """펀딩 개설 조건과 목표 금액 상한 (v2.2: 상장 전 유료 미리보기가 없어 열람자 × 결제율로 추정)."""

    work_id: int
    target_amount: int
    pilot_readers_4w: int = Field(description="참고: 최근 4주 파일럿 열람자")
    pilot_paying_fans_4w: int = Field(description="최근 4주 유료 미리보기 구매자 (상장 전에는 0)")
    expected_paying_fans: int = Field(description="월 유료 팬 추정 (상한·시나리오 기준)")
    fans_basis: str = Field(description="READERS_X_PAY_RATE = 파일럿 4주 열람자 × 가정 결제율 15% (상장 전 유료 미리보기 없음) | PAID_PILOT = 실제 유료 구매자")
    paying_fans_needed: int
    gate_threshold: int = Field(description="필요 유료 팬의 100%")
    passes_gate: bool
    target_cap: int = Field(description="월 유료 팬 추정 × 1명당 상품 기간 투자자 몫(세후) × 70%")
    within_cap: bool
    enforced: bool


class ReconciliationOut(BaseModel):
    period: str
    unlock_gross: int = Field(description="이 펀딩으로 표시된 유료 결제 합계 (결제 원천)")
    trust_inflow: int = Field(description="신탁 계좌에 실제로 들어간 금액 (원장)")
    recorded_gross: int | None = Field(description="배당 재원으로 기록된 유료 회차 매출 (집계 전이면 null)")
    leaked_unlocks: int = Field(description="상장 후인데 신탁 계좌를 거치지 않은 결제 건수 (0이어야 정상)")
    matched: bool
    ledger_hash: str = Field(description="해당 분기 신탁 결제 기록의 SHA-256 연쇄 해시 (공시용)")
    records: int


class DisclosureOut(BaseModel):
    """공시 묶음 (v5.0): 투자금 쓰임, 매출 배분, 상품 기간, 1인 한도, 분기별 정산 대사와 원장 해시."""

    funding_id: int
    cost_per_100: dict = Field(description="투자금 100원 중 작가·발행 실비·최소 유보금·DIBS 몫")
    creator_token: dict = Field(default_factory=dict, description="창작자 토큰 몫(bps)과 보호예수 개월")
    revenue_split: dict = Field(description="순매출 배분 (회수 전·후)")
    term: dict = Field(description="고정 운용 기간 여부(v2.2: 없음), 원금 상환 없음")
    per_user_cap_amount: int
    buyback_enabled: bool
    settlement_basis: str
    verification: list[str]
    reconciliation: list[ReconciliationOut]


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
    episodes_required: int | None = None
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
    monthly_readers: int = Field(description="참고: 결제율 15%(플랫폼 평균, 상한값)로 환산한 월 열람자")


class BreakevenOut(BaseModel):
    """손익분기 규모 공시 (청약 화면). 회수 전 투자자 몫(세후)으로 시즌 안·상품 기간 안에 원금을 돌려받는 데 필요한 규모."""

    funding_id: int
    target_amount: int
    price_coin: int
    monthly_episodes: int
    inapp_fee_bps: int
    royalty_holder_bps: int
    lines: list[BreakevenLine]


class DiscontinueIn(BaseModel):
    reason: str
    kind: Literal["FAULT", "NO_FAULT"] = Field(
        default="NO_FAULT", description="FAULT = 작가 귀책(유죄 판결·표절·권리 분쟁·계약 위반·연재 기한 초과), "
                                        "NO_FAULT = 불가피한 사유(건강·불가항력)")


class HiatusIn(BaseModel):
    weeks: int = Field(ge=1, le=52)
    reason: str


class ClawbackIn(BaseModel):
    amount: int = Field(ge=1)


class DiscontinueOut(BaseModel):
    kind: str = "NO_FAULT"
    cancelled_payout_amount: int
    distributed: int
    holders: int
    escrow_forfeited: int = 0
    clawback_due: int = 0
    clawback_outstanding: int = 0
