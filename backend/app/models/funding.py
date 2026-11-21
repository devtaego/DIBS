from datetime import date, datetime

from sqlalchemy import JSON, BigInteger, Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core import clock
from app.core.config import settings
from app.core.db import Base
from app.models.base import TimestampMixin, enum_col
from app.models.enums import (
    FundingStatus,
    IssuanceStep,
    Mode,
    PayoutStatus,
    PayoutTrigger,
    SecurityType,
    SubscriptionStatus,
)


class Funding(TimestampMixin, Base):
    """펀딩 = 조각 청약. 상장 후에는 같은 레코드가 '종목' 역할을 한다.

    정책값(배분율·배정 방식·운용 기간 등)은 작품마다 운영자가 정하므로
    전역 설정을 기본값으로 복사해 이 레코드에 저장한다.
    """

    __tablename__ = "fundings"

    id: Mapped[int] = mapped_column(primary_key=True)
    work_id: Mapped[int] = mapped_column(ForeignKey("works.id"), index=True)
    status: Mapped[FundingStatus] = enum_col(FundingStatus, default=FundingStatus.DRAFT, index=True)
    mode: Mapped[Mode] = enum_col(Mode, default=Mode.MOCK)
    security_type: Mapped[SecurityType] = enum_col(SecurityType, default=SecurityType.UNDECIDED)

    # 모집 조건
    unit_price: Mapped[int] = mapped_column(Integer, default=lambda: settings.default_unit_price)
    target_units: Mapped[int] = mapped_column(Integer)
    max_units_per_user: Mapped[int | None] = mapped_column(Integer)
    open_at: Mapped[datetime | None] = mapped_column(DateTime)
    close_at: Mapped[datetime | None] = mapped_column(DateTime)
    use_of_funds: Mapped[str] = mapped_column(Text, default="")  # 자금 사용 계획
    risk_note: Mapped[str] = mapped_column(Text, default="")

    # 모금액 배분 (bps)
    creator_bps: Mapped[int] = mapped_column(Integer, default=lambda: settings.creator_bps)
    issuance_cost_bps: Mapped[int] = mapped_column(Integer, default=lambda: settings.issuance_cost_bps)
    platform_fee_bps: Mapped[int] = mapped_column(Integer, default=lambda: settings.platform_fee_bps)
    reserve_bps: Mapped[int] = mapped_column(Integer, default=lambda: settings.reserve_bps)  # 최소 유보금 (신탁 보관)
    creator_token_bps: Mapped[int] = mapped_column(Integer, default=lambda: settings.creator_token_bps)  # 창작자 토큰 몫
    creator_lockup_months: Mapped[int] = mapped_column(Integer, default=lambda: settings.creator_lockup_months)

    # 배당 재원(순매출) 배분 (bps) — v4.0 회수 우선 배분
    # 회수 전 (기본 작가 30 / 투자자 45 / DIBS 25)
    royalty_platform_bps: Mapped[int] = mapped_column(Integer, default=lambda: settings.royalty_platform_bps)
    royalty_creator_bps: Mapped[int] = mapped_column(Integer, default=lambda: settings.royalty_creator_bps)
    royalty_holder_bps: Mapped[int] = mapped_column(Integer, default=lambda: settings.royalty_holder_bps)
    # 회수 후 (기본 작가 40 / 투자자 35 / DIBS 25)
    royalty_platform_after_bps: Mapped[int] = mapped_column(Integer, default=lambda: settings.royalty_platform_after_bps)
    royalty_creator_after_bps: Mapped[int] = mapped_column(Integer, default=lambda: settings.royalty_creator_after_bps)
    royalty_holder_after_bps: Mapped[int] = mapped_column(Integer, default=lambda: settings.royalty_holder_after_bps)
    # 회수 판정: 원천징수 후 누적 분배금이 발행액에 닿은 분기. 다음 분기부터 '회수 후' 비율
    recouped_period: Mapped[str | None] = mapped_column(String(7))

    # 배정 방식 (v2.3: 균등 20 / 비례 80, 균등분이 참여자보다 적으면 공개 추첨으로 1조각씩)
    allocation_strategy: Mapped[str] = mapped_column(String(50), default=lambda: settings.default_allocation_strategy)
    allocation_params: Mapped[dict] = mapped_column(
        JSON, default=lambda: {"equal_ratio_bps": settings.default_equal_ratio_bps,
                               "early_reader_bps": settings.default_early_reader_bps})

    # 공모 회차 (예: "2027-03"): 같은 달 공모 작품은 증권신고·법률·회계 검토를 함께 진행해 발행 실비를 나눈다.
    # 증권은 작품별로 따로 발행한다 (묶음 상품 아님)
    offering_round: Mapped[str | None] = mapped_column(String(7), index=True)

    # 시즌 단위 (v5.0). 종료 규칙: 완결 후 12개월 또는 저매출 2분기 연속. 작가 매입은 선택 사항
    exclusive_months: Mapped[int] = mapped_column(Integer, default=lambda: settings.exclusive_months)
    exclusive_until: Mapped[datetime | None] = mapped_column(DateTime)  # 상장 시 계산
    external_share_bps: Mapped[int] = mapped_column(Integer, default=lambda: settings.external_share_bps)
    failed_at: Mapped[datetime | None] = mapped_column(DateTime)  # 목표 미달 마감 (재신청 대기 기준)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)  # 연재 완결 확정
    terminated_at: Mapped[datetime | None] = mapped_column(DateTime)
    termination_reason: Mapped[str | None] = mapped_column(String(50))  # COMPLETED_TERM | LOW_REVENUE | BUYBACK
    buyback_enabled: Mapped[bool] = mapped_column(Boolean, default=False)  # 작가 매입 옵션 (선택 사항)
    discontinued_at: Mapped[datetime | None] = mapped_column(DateTime)  # 연재 중단 확정
    discontinue_kind: Mapped[str | None] = mapped_column(String(10))  # FAULT | NO_FAULT

    # 연재 약정 (태업·조기 완결·귀책 중단 대비)
    committed_episodes: Mapped[int] = mapped_column(Integer, default=lambda: settings.default_committed_episodes)
    monthly_quota: Mapped[int] = mapped_column(Integer, default=lambda: settings.monthly_episode_quota)
    buffer_episodes: Mapped[int | None] = mapped_column(Integer)  # 공모 전 비축분 (DIBS 심사 때 확인)
    hiatus_weeks_used: Mapped[int] = mapped_column(Integer, default=0)  # 미리 알린 휴재 누적 주
    episodes_at_listing: Mapped[int | None] = mapped_column(Integer)  # 상장 시점 회차 수 (시즌 진행 기준점)
    delay_warned_at: Mapped[datetime | None] = mapped_column(DateTime)
    early_completed: Mapped[bool] = mapped_column(Boolean, default=False)  # 약정 회차 전에 완결
    creator_escrow_balance: Mapped[int] = mapped_column(BigInteger, default=0)  # 유보 중인 작가 매출 몫
    reserve_balance: Mapped[int] = mapped_column(BigInteger, default=0)  # 신탁 보관 중인 최소 유보금 (모금액 5%)
    clawback_due: Mapped[int] = mapped_column(BigInteger, default=0)  # 귀책 중단 반환 청구액
    clawback_collected: Mapped[int] = mapped_column(BigInteger, default=0)

    # 마켓
    reference_price: Mapped[int | None] = mapped_column(Integer)  # 가격제한폭 기준가 (전일 종가)
    last_price: Mapped[int | None] = mapped_column(Integer)
    listed_at: Mapped[datetime | None] = mapped_column(DateTime)

    review_note: Mapped[str | None] = mapped_column(Text)

    reward_tiers: Mapped[list["RewardTier"]] = relationship(order_by="RewardTier.min_units")

    @property
    def target_amount(self) -> int:
        return self.unit_price * self.target_units


class RewardTier(Base):
    """펀딩에 딸린 선택 리워드 (펀딩당 최대 5개)."""

    __tablename__ = "reward_tiers"

    id: Mapped[int] = mapped_column(primary_key=True)
    funding_id: Mapped[int] = mapped_column(ForeignKey("fundings.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    min_units: Mapped[int] = mapped_column(Integer)
    limited_qty: Mapped[int | None] = mapped_column(Integer)
    requires_shipping: Mapped[bool] = mapped_column(Boolean, default=False)


class Subscription(TimestampMixin, Base):
    """청약. 회원당 펀딩별 1건이며 수량은 PATCH 로 변경한다."""

    __tablename__ = "subscriptions"
    __table_args__ = (UniqueConstraint("funding_id", "user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    funding_id: Mapped[int] = mapped_column(ForeignKey("fundings.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    units: Mapped[int] = mapped_column(Integer)  # 청약 수량
    status: Mapped[SubscriptionStatus] = enum_col(SubscriptionStatus, default=SubscriptionStatus.ACTIVE)
    allocated_units: Mapped[int | None] = mapped_column(Integer)
    requested_tier_id: Mapped[int | None] = mapped_column(ForeignKey("reward_tiers.id"))
    assigned_tier_id: Mapped[int | None] = mapped_column(ForeignKey("reward_tiers.id"))
    shipping: Mapped[dict | None] = mapped_column(JSON)
    first_subscribed_at: Mapped[datetime] = mapped_column(DateTime)  # 동점 시 먼저 청약한 회원 우선
    # 리워드 배송 (창작자 스튜디오에서 입력)
    tracking_carrier: Mapped[str | None] = mapped_column(String(50))
    tracking_no: Mapped[str | None] = mapped_column(String(100))
    shipped_at: Mapped[datetime | None] = mapped_column(DateTime)
    consents: Mapped[dict | None] = mapped_column(JSON)  # 청약 시 동의 항목·시각 기록


class Issuance(TimestampMixin, Base):
    """토큰증권 발행 진행 (제휴 증권사). 실제 발행인·계좌관리기관 역할은 증권 구조 확정 후 결정."""

    __tablename__ = "issuances"

    id: Mapped[int] = mapped_column(primary_key=True)
    funding_id: Mapped[int] = mapped_column(ForeignKey("fundings.id"), unique=True)
    step: Mapped[IssuanceStep] = enum_col(IssuanceStep, default=IssuanceStep.REQUESTED)
    broker_name: Mapped[str | None] = mapped_column(String(100))
    security_code: Mapped[str | None] = mapped_column(String(50))  # 증권 식별번호
    trustee: Mapped[str | None] = mapped_column(String(100))  # 신탁·수탁 기관
    listing_date: Mapped[date | None] = mapped_column(Date)
    failed_reason: Mapped[str | None] = mapped_column(Text)
    history: Mapped[list] = mapped_column(JSON, default=list)  # [{step, at, note}]


class PayoutSchedule(Base):
    """작가 지급 일정. 기획 확정 전이라 '상장 시 100%' 1건이 기본이고, 분할 지급으로 바꿀 수 있다."""

    __tablename__ = "payout_schedules"
    __table_args__ = (UniqueConstraint("funding_id", "seq"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    funding_id: Mapped[int] = mapped_column(ForeignKey("fundings.id"), index=True)
    seq: Mapped[int] = mapped_column(Integer)
    bps: Mapped[int] = mapped_column(Integer)  # 작가 지급분 중 비율
    trigger: Mapped[PayoutTrigger] = enum_col(PayoutTrigger)
    milestone_note: Mapped[str | None] = mapped_column(String(255))
    episodes_required: Mapped[int | None] = mapped_column(Integer)  # 시즌 연재가 이 회차에 닿으면 자동 지급
    status: Mapped[PayoutStatus] = enum_col(PayoutStatus, default=PayoutStatus.PENDING)
    amount: Mapped[int | None] = mapped_column(BigInteger)
    paid_journal_id: Mapped[int | None] = mapped_column(ForeignKey("journals.id"))


class SpecialDistribution(Base):
    """배당 외 특별 분배: 연재 중단·조기 완결로 취소된 작가 지급분, 귀책 시 유보금·반환금.

    INTERNAL 모드는 바로 예치금으로, BROKER 모드는 분배 지시서를 만들고 증권사 지급 완료 웹훅을 받아 확정한다.
    """

    __tablename__ = "special_distributions"

    id: Mapped[int] = mapped_column(primary_key=True)
    funding_id: Mapped[int] = mapped_column(ForeignKey("fundings.id"), index=True)
    kind: Mapped[str] = mapped_column(String(30))  # DISCONTINUE | EARLY_COMPLETION | ESCROW_FORFEIT | CLAWBACK
    amount: Mapped[int] = mapped_column(BigInteger)
    lines: Mapped[list] = mapped_column(JSON, default=list)  # [{user_id, units, amount}]
    status: Mapped[str] = mapped_column(String(20), default="PAID")  # PAID | INSTRUCTED
    memo: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=clock.now)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime)
