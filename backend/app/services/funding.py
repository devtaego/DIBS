"""펀딩(조각 청약) → 안분 배정 → 발행 → 상장 → 작가 지급.

상태 흐름:
  IN_REVIEW → APPROVED → OPEN → (마감) → ALLOCATED → ISSUING → LISTED
                 ↘ REJECTED        ↘ FAILED (목표 미달)  ↘ ISSUE_FAILED (발행 실패)
  LISTED ⇄ SUSPENDED (거래 정지),  LISTED → TERMINATED (만기 없음. 종료 규칙·작가 매입은 services/product.py)
"""
import calendar
from dataclasses import dataclass, field
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core import clock
from app.core.config import settings
from app.core.errors import Conflict, DomainError, Forbidden, NotFound
from app.models import ContentEvent, Dib, Funding, Holding, Issuance, PayoutSchedule, RewardTier, Subscription, User, Work
from app.models.enums import (
    ISSUANCE_ORDER,
    AccountKind,
    FundingStatus,
    IssuanceStep,
    PayoutStatus,
    PayoutTrigger,
    EventType,
    SubscriptionStatus,
    WorkStatus,
)
from app.services import ledger, product, serial
from app.services.allocation import STRATEGIES, AllocationRequest, get_strategy
from app.services.ledger import Leg
from app.services.policy import check_investment_limit, current_mode, ensure_mode_allowed, notify

ACTIVE_FUNDING_STATUSES = {
    FundingStatus.IN_REVIEW, FundingStatus.APPROVED, FundingStatus.OPEN,
    FundingStatus.ALLOCATED, FundingStatus.ISSUING, FundingStatus.LISTED, FundingStatus.SUSPENDED,
}
MAX_REWARD_TIERS = 5

# 운영자가 심사 시 덮어쓸 수 있는 조건
REVIEWABLE_TERMS = {
    "unit_price", "target_units", "max_units_per_user", "open_at", "close_at", "security_type",
    "creator_bps", "issuance_cost_bps", "platform_fee_bps", "reserve_bps", "creator_token_bps", "creator_lockup_months",
    "royalty_platform_bps", "royalty_creator_bps", "royalty_holder_bps",
    "royalty_platform_after_bps", "royalty_creator_after_bps", "royalty_holder_after_bps",
    "allocation_strategy", "allocation_params", "offering_round", "risk_note", "buyback_enabled",
    "committed_episodes", "monthly_quota", "buffer_episodes",
}


def get_funding(db: Session, funding_id: int) -> Funding:
    f = db.get(Funding, funding_id)
    if f is None:
        raise NotFound("FUNDING_NOT_FOUND", "펀딩을 찾을 수 없어요")
    return f


def _require(f: Funding, *statuses: FundingStatus) -> None:
    if f.status not in statuses:
        raise Conflict("INVALID_FUNDING_STATUS", f"현재 상태({f.status})에서는 할 수 없어요")


def _validate_terms(f: Funding) -> None:
    if f.creator_bps + f.issuance_cost_bps + f.reserve_bps + f.platform_fee_bps != 10000:
        raise DomainError("INVALID_TERMS", "모금액 배분율 합계는 100%여야 해요")
    if f.royalty_platform_bps + f.royalty_creator_bps + f.royalty_holder_bps != 10000:
        raise DomainError("INVALID_TERMS", "회수 전 배당 재원 배분율 합계는 100%여야 해요")
    if f.royalty_platform_after_bps + f.royalty_creator_after_bps + f.royalty_holder_after_bps != 10000:
        raise DomainError("INVALID_TERMS", "회수 후 배당 재원 배분율 합계는 100%여야 해요")
    if f.allocation_strategy not in STRATEGIES:
        raise DomainError("INVALID_TERMS", f"배정 방식은 {STRATEGIES} 중 하나여야 해요")
    get_strategy(f.allocation_strategy, f.allocation_params)  # 파라미터 검증
    serial.validate_commitment(f)  # 시즌 약정 회차·비축분
    if f.open_at and f.close_at:
        days = (f.close_at - f.open_at).days
        if not settings.min_funding_days <= days <= settings.max_funding_days:
            raise DomainError("INVALID_TERMS", f"모집 기간은 {settings.min_funding_days}~{settings.max_funding_days}일이에요")
    if not settings.min_target_amount <= f.target_amount <= settings.max_target_amount:
        raise DomainError("INVALID_TERMS", f"모집 목표금액은 {settings.min_target_amount:,}원 이상이어야 해요")
    if not f.offering_round and f.open_at:
        f.offering_round = f.open_at.strftime("%Y-%m")  # 기본: 모집 시작 달의 공모 회차
    cap = product.per_user_cap_amount(f.target_amount) // f.unit_price
    if f.max_units_per_user is None or f.max_units_per_user > cap:
        f.max_units_per_user = max(1, cap)  # 1인 한도: 3,000만 원과 발행액 5% 중 작은 금액


# ───────────────────────────── 신청·심사·오픈 ─────────────────────────────

def apply_funding(db: Session, creator: User, work: Work, data: dict, tiers: list[dict]) -> Funding:
    if work.creator_id != creator.id:
        raise Forbidden("NOT_WORK_OWNER", "내 작품만 펀딩을 신청할 수 있어요")
    if work.status != WorkStatus.PUBLISHED:
        raise Conflict("WORK_NOT_PUBLISHED", "공개된 작품만 펀딩을 신청할 수 있어요")
    # 이전 시즌이 완결 처리됐으면(완결 후 12개월 꼬리 기간) 다음 시즌 펀딩을 열 수 있다
    exists = db.scalar(select(Funding.id).where(Funding.work_id == work.id, Funding.status.in_(ACTIVE_FUNDING_STATUSES),
                                                Funding.completed_at.is_(None)))
    if exists:
        raise Conflict("FUNDING_ALREADY_ACTIVE", "이 작품은 이미 진행 중인 펀딩이 있어요")
    if len(tiers) > MAX_REWARD_TIERS:
        raise DomainError("TOO_MANY_TIERS", f"리워드 티어는 최대 {MAX_REWARD_TIERS}개예요")

    f = Funding(work_id=work.id, status=FundingStatus.IN_REVIEW, mode=current_mode(), **data)
    db.add(f)
    db.flush()
    _validate_terms(f)
    product.check_funding_gate(db, work.id, f.target_amount)  # 파일럿 열람자 기준선·목표 금액 상한
    for t in tiers:
        db.add(RewardTier(funding_id=f.id, **t))
    db.flush()
    return f


def review_funding(db: Session, f: Funding, approve: bool, terms: dict, note: str | None,
                   payout_schedule: list[dict] | None = None) -> Funding:
    _require(f, FundingStatus.IN_REVIEW)
    f.review_note = note
    if not approve:
        f.status = FundingStatus.REJECTED
        return f
    for k, v in terms.items():
        if k not in REVIEWABLE_TERMS:
            raise DomainError("INVALID_TERMS", f"수정할 수 없는 항목: {k}")
        setattr(f, k, v)
    _validate_terms(f)
    serial.validate_commitment(f, check_buffer=True)
    if not (f.open_at and f.close_at):
        raise DomainError("INVALID_TERMS", "모집 시작·마감 시각을 정해 주세요")

    schedule = payout_schedule or settings.default_payout_schedule  # 상장 40% · 약정 절반 30% · 약정 완결 30%
    if sum(s["bps"] for s in schedule) != 10000:
        raise DomainError("INVALID_PAYOUT_SCHEDULE", "작가 지급 비율 합계는 100%여야 해요")
    for old in db.scalars(select(PayoutSchedule).where(PayoutSchedule.funding_id == f.id)):
        db.delete(old)
    db.flush()
    for i, s in enumerate(schedule, start=1):
        need = serial.episodes_for(f.committed_episodes, s["episodes_bps"]) if s.get("episodes_bps") else None
        db.add(PayoutSchedule(funding_id=f.id, seq=i, bps=s["bps"], trigger=PayoutTrigger(s["trigger"]),
                              milestone_note=s.get("milestone_note"), episodes_required=need))
    f.status = FundingStatus.APPROVED
    return f


def open_funding(db: Session, f: Funding) -> Funding:
    _require(f, FundingStatus.APPROVED)
    ensure_mode_allowed(f.mode)
    f.status = FundingStatus.OPEN
    work = db.get(Work, f.work_id)
    for (uid,) in db.execute(select(Dib.user_id).where(Dib.work_id == f.work_id)):
        notify(db, uid, "DIBBED_FUNDING_OPEN", f"찜한 「{work.title}」 펀딩이 열렸어요", ref_type="funding", ref_id=f.id)
    return f


# ───────────────────────────── 청약 ─────────────────────────────

def _check_can_subscribe(db: Session, user: User, f: Funding) -> None:
    _require(f, FundingStatus.OPEN)
    ensure_mode_allowed(f.mode)
    now = clock.now()
    if not (f.open_at <= now < f.close_at):
        raise Conflict("FUNDING_NOT_IN_PERIOD", "모집 기간이 아니에요")
    if not user.kyc_verified:
        raise Forbidden("KYC_REQUIRED", "본인인증 후 청약할 수 있어요")
    if not user.risk_checked_at:
        raise Forbidden("RISK_PROFILE_REQUIRED", "투자성향 확인 후 청약할 수 있어요")
    if user.birth_date and not user.is_adult(now.date()):
        raise Forbidden("UNDERAGE", f"만 {settings.adult_age}세 이상부터 투자할 수 있어요")
    if db.get(Work, f.work_id).creator_id == user.id:
        raise Forbidden("SELF_INVEST_FORBIDDEN", "창작자는 자기 작품에 청약할 수 없어요")


def _check_first_time_cap(user: User, f: Funding, units: int) -> None:
    """투자 경험이 없다고 답한 고객은 1인 한도보다 작은 소액 한도(기본 10만 원)를 적용한다 (민원 위험 완화)."""
    cap = settings.first_time_cap_amount
    if user.no_investment_experience and units * f.unit_price > cap:
        raise DomainError("FIRST_TIME_CAP", f"투자 경험이 없는 고객은 {cap:,}원까지 청약할 수 있어요")


def _is_locked(f: Funding) -> bool:
    return clock.now() >= f.close_at - timedelta(minutes=settings.subscription_lock_minutes)


def _validate_units_and_tier(db: Session, f: Funding, units: int, tier_id: int | None,
                             shipping: dict | None, exclude_sub_id: int | None = None) -> None:
    if units < 1:
        raise DomainError("INVALID_UNITS", "1조각 이상 청약해 주세요")
    cap = product.per_user_cap_units(f)
    if units > cap:
        raise DomainError("MAX_UNITS_EXCEEDED", f"1인 최대 {cap}조각까지 청약할 수 있어요")
    if tier_id is None:
        return
    tier = db.get(RewardTier, tier_id)
    if tier is None or tier.funding_id != f.id:
        raise NotFound("TIER_NOT_FOUND", "리워드를 찾을 수 없어요")
    if units < tier.min_units:
        raise DomainError("TIER_MIN_UNITS", f"이 리워드는 {tier.min_units}조각 이상 청약해야 받을 수 있어요")
    if tier.requires_shipping and not shipping:
        raise DomainError("SHIPPING_REQUIRED", "배송지를 입력해 주세요")
    if tier.limited_qty is not None:
        q = select(func.count()).where(
            Subscription.requested_tier_id == tier.id, Subscription.status == SubscriptionStatus.ACTIVE)
        if exclude_sub_id:
            q = q.where(Subscription.id != exclude_sub_id)
        if db.scalar(q) >= tier.limited_qty:
            raise Conflict("TIER_SOLD_OUT", "한정 수량이 모두 찼어요")


def _lock_deposit(db: Session, user_id: int, f: Funding, amount: int, sub_id: int) -> None:
    """amount > 0 이면 예치금을 묶고, < 0 이면 푼다."""
    if amount == 0:
        return
    acc = ledger.user_accounts(db, user_id, f.mode)
    ledger.post(db, "SUBSCRIPTION_LOCK" if amount > 0 else "SUBSCRIPTION_UNLOCK",
                [Leg(acc.deposit, -amount), Leg(acc.locked, amount)], f.mode, "subscription", sub_id)


def subscribe(db: Session, user: User, f: Funding, units: int, tier_id: int | None, shipping: dict | None,
              consents: dict | None = None) -> Subscription:
    _check_can_subscribe(db, user, f)
    sub = db.scalar(select(Subscription).where(Subscription.funding_id == f.id, Subscription.user_id == user.id))
    if sub and sub.status == SubscriptionStatus.ACTIVE:
        raise Conflict("ALREADY_SUBSCRIBED", "이미 청약했어요. 수량 변경을 이용해 주세요")
    # 취소 후 재청약은 '증액'과 같아 잠금 시간에도 허용하고, 동점 순위(first_subscribed_at)는 새로 매긴다
    _validate_units_and_tier(db, f, units, tier_id, shipping)
    _check_first_time_cap(user, f, units)
    check_investment_limit(db, user, f.mode, f.id, units * f.unit_price)

    now = clock.now()
    if sub is None:
        sub = Subscription(funding_id=f.id, user_id=user.id, units=units, first_subscribed_at=now)
        db.add(sub)
    else:  # CANCELLED → 재청약
        sub.units, sub.status, sub.first_subscribed_at = units, SubscriptionStatus.ACTIVE, now
    sub.requested_tier_id, sub.shipping = tier_id, shipping
    sub.consents = {**(consents or {}), "agreed_at": now.isoformat()}
    db.flush()
    _lock_deposit(db, user.id, f, units * f.unit_price, sub.id)
    return sub


def change_subscription(db: Session, user: User, f: Funding, units: int,
                        tier_id: int | None = None, shipping: dict | None = None) -> Subscription:
    _check_can_subscribe(db, user, f)
    sub = _my_active_sub(db, user, f)
    delta = units - sub.units
    if delta < 0 and _is_locked(f):
        raise Conflict("SUBSCRIPTION_LOCKED",
                       f"마감 {settings.subscription_lock_minutes}분 전부터는 감액·취소할 수 없어요")
    tier_id = tier_id if tier_id is not None else sub.requested_tier_id
    shipping = shipping if shipping is not None else sub.shipping
    _validate_units_and_tier(db, f, units, tier_id, shipping, exclude_sub_id=sub.id)
    _check_first_time_cap(user, f, units)
    check_investment_limit(db, user, f.mode, f.id, delta * f.unit_price)
    sub.units, sub.requested_tier_id, sub.shipping = units, tier_id, shipping
    _lock_deposit(db, user.id, f, delta * f.unit_price, sub.id)
    return sub


def cancel_subscription(db: Session, user: User, f: Funding) -> Subscription:
    _check_can_subscribe(db, user, f)
    sub = _my_active_sub(db, user, f)
    if _is_locked(f):
        raise Conflict("SUBSCRIPTION_LOCKED",
                       f"마감 {settings.subscription_lock_minutes}분 전부터는 감액·취소할 수 없어요")
    _lock_deposit(db, user.id, f, -sub.units * f.unit_price, sub.id)
    sub.status = SubscriptionStatus.CANCELLED
    return sub


def _my_active_sub(db: Session, user: User, f: Funding) -> Subscription:
    sub = db.scalar(select(Subscription).where(
        Subscription.funding_id == f.id, Subscription.user_id == user.id,
        Subscription.status == SubscriptionStatus.ACTIVE))
    if sub is None:
        raise NotFound("SUBSCRIPTION_NOT_FOUND", "청약 내역이 없어요")
    return sub


def funding_progress(db: Session, f: Funding) -> dict:
    statuses = [SubscriptionStatus.ACTIVE, SubscriptionStatus.ALLOCATED]
    units, participants = db.execute(
        select(func.coalesce(func.sum(Subscription.units), 0), func.count())
        .where(Subscription.funding_id == f.id, Subscription.status.in_(statuses))
    ).one()
    units = int(units)
    return {
        "requested_units": units,
        "raised_amount": units * f.unit_price,  # 청약 기준 (배정 전)
        "participants": participants,
        "achievement_pct": round(units * 100 / f.target_units, 1) if f.target_units else 0.0,  # 100% 초과 가능
    }


# ───────────────────────────── 마감·안분 배정 ─────────────────────────────

@dataclass
class CloseResult:
    status: FundingStatus
    requested_units: int
    target_units: int
    allocations: list[dict] = field(default_factory=list)


def close_funding(db: Session, f: Funding, force: bool = False) -> CloseResult:
    _require(f, FundingStatus.OPEN)
    if not force and clock.now() < f.close_at:
        raise Conflict("FUNDING_NOT_CLOSED_YET", "아직 마감 시각이 아니에요")

    subs = list(db.scalars(select(Subscription).where(
        Subscription.funding_id == f.id, Subscription.status == SubscriptionStatus.ACTIVE)))
    total = sum(s.units for s in subs)
    work = db.get(Work, f.work_id)

    # 목표 미달 → 펀딩 실패, 묶인 금액 전액 해제
    if total < f.target_units:
        legs_by_user = []
        for s in subs:
            acc = ledger.user_accounts(db, s.user_id, f.mode)
            amt = s.units * f.unit_price
            legs_by_user += [Leg(acc.locked, -amt), Leg(acc.deposit, amt)]
            s.status, s.allocated_units = SubscriptionStatus.REFUNDED, 0
            notify(db, s.user_id, "FUNDING_FAILED", f"「{work.title}」 펀딩이 목표에 못 미쳐 종료됐어요",
                   "묶여 있던 예치금을 모두 돌려드렸어요.", "funding", f.id)
        if legs_by_user:
            ledger.post(db, "FUNDING_FAILED_RELEASE", legs_by_user, f.mode, "funding", f.id)
        f.status = FundingStatus.FAILED
        return CloseResult(f.status, total, f.target_units)

    params = dict(f.allocation_params or {})
    if f.allocation_strategy == "EQUAL_THEN_PRO_RATA":
        params["lottery_seed"] = f.id  # 균등분이 참여자보다 적으면 공개 추첨 (시드 = 펀딩 번호)
    strategy = get_strategy(f.allocation_strategy, params)
    early = early_readers(db, f)
    reqs = [AllocationRequest(s.id, s.units, (s.first_subscribed_at, s.id), s.user_id in early) for s in subs]
    alloc = strategy.allocate(reqs, f.target_units)

    legs, escrow_total, result = [], 0, []
    for s in subs:
        a = alloc[s.id]
        acc = ledger.user_accounts(db, s.user_id, f.mode)
        cost, refund = a * f.unit_price, (s.units - a) * f.unit_price
        legs += [Leg(acc.locked, -(cost + refund)), Leg(acc.deposit, refund)]
        escrow_total += cost
        s.allocated_units = a
        s.status = SubscriptionStatus.ALLOCATED if a > 0 else SubscriptionStatus.REFUNDED
        result.append({"subscription_id": s.id, "user_id": s.user_id, "requested": s.units, "allocated": a,
                       "early_reader": s.user_id in early})
        if a > 0:
            notify(db, s.user_id, "ALLOCATED", f"「{work.title}」 {a}조각이 배정됐어요",
                   f"청약 {s.units}조각 중 {a}조각 배정, {refund:,}원은 바로 돌려드렸어요.", "funding", f.id)
        else:
            notify(db, s.user_id, "ALLOCATED_ZERO", f"「{work.title}」 청약이 많아 배정되지 않았어요",
                   "청약금 전액을 돌려드렸어요.", "funding", f.id)
    legs.append(Leg(ledger.sys(db, AccountKind.SYS_FUNDING_ESCROW, f.mode), escrow_total))
    ledger.post(db, "FUNDING_ALLOCATION", legs, f.mode, "funding", f.id)

    _assign_rewards(db, f, subs, work)
    f.status = FundingStatus.ALLOCATED
    return CloseResult(f.status, total, f.target_units, result)


def prior_season_holders(db: Session, f: Funding) -> set[int]:
    """같은 작품 이전 시즌 펀딩을 보유한 회원 (다음 시즌 우선 청약, v5.0)."""
    return set(db.scalars(select(Holding.user_id).join(Funding, Funding.id == Holding.funding_id).where(
        Funding.work_id == f.work_id, Funding.id != f.id, Holding.mode == f.mode, Holding.units > 0)))


def early_readers(db: Session, f: Funding) -> set[int]:
    """우선 배정 대상 = 초기 독자 ∪ 이전 시즌 보유자.

    초기 독자는 공짜 찜만으로 우선권을 얻지 못하도록 세 조건을 모두 본다.
    1) 모집 시작 7일 전까지 찜  2) 모집 시작 전 이 작품 회차 완독 1회 이상  3) 본인인증 계정
    """
    return _early_readers(db, f) | prior_season_holders(db, f)


def _early_readers(db: Session, f: Funding) -> set[int]:
    open_at = f.open_at or clock.now()
    dib_cutoff = open_at - timedelta(days=settings.early_reader_dib_days_before)
    dibbed = set(db.scalars(select(Dib.user_id).join(User, User.id == Dib.user_id).where(
        Dib.work_id == f.work_id, Dib.created_at <= dib_cutoff, User.kyc_verified.is_(True))))
    if not dibbed:
        return set()
    readers = set(db.scalars(select(ContentEvent.user_id).where(
        ContentEvent.work_id == f.work_id, ContentEvent.event_type == EventType.VIEW_COMPLETE,
        ContentEvent.occurred_at < open_at, ContentEvent.user_id.in_(dibbed))))
    return dibbed & readers


def _assign_rewards(db: Session, f: Funding, subs: list[Subscription], work: Work) -> None:
    """배정이 줄어 자격이 바뀌면 받을 수 있는 티어로 자동 변경 (한정 수량은 먼저 청약한 순)."""
    tiers = sorted(f.reward_tiers, key=lambda t: -t.min_units)
    used: dict[int, int] = {}
    tiers_by_id = {t.id: t for t in tiers}
    for s in sorted(subs, key=lambda s: (s.first_subscribed_at, s.id)):
        if not s.requested_tier_id or not s.allocated_units:
            s.assigned_tier_id = None
            continue
        requested = tiers_by_id[s.requested_tier_id]
        chosen = None
        for t in tiers:
            if t.min_units > s.allocated_units or t.min_units > requested.min_units:
                continue
            if t.requires_shipping and not s.shipping:
                continue
            if t.limited_qty is not None and used.get(t.id, 0) >= t.limited_qty:
                continue
            chosen = t
            break
        s.assigned_tier_id = chosen.id if chosen else None
        if chosen:
            used[chosen.id] = used.get(chosen.id, 0) + 1
        if s.assigned_tier_id != s.requested_tier_id:
            msg = f"'{chosen.title}'(으)로 변경됐어요" if chosen else "받을 수 있는 리워드가 없어요"
            notify(db, s.user_id, "REWARD_CHANGED", f"「{work.title}」 배정 조각이 줄어 리워드가 {msg}",
                   ref_type="funding", ref_id=f.id)


# ───────────────────────────── 발행·상장·작가 지급 ─────────────────────────────

def request_issuance(db: Session, f: Funding, broker_name: str | None) -> Issuance:
    _require(f, FundingStatus.ALLOCATED)
    iss = Issuance(funding_id=f.id, broker_name=broker_name, step=IssuanceStep.REQUESTED,
                   history=[{"step": IssuanceStep.REQUESTED, "at": clock.now().isoformat()}])
    db.add(iss)
    f.status = FundingStatus.ISSUING
    db.flush()
    return iss


def get_issuance(db: Session, f: Funding) -> Issuance:
    iss = db.scalar(select(Issuance).where(Issuance.funding_id == f.id))
    if iss is None:
        raise NotFound("ISSUANCE_NOT_FOUND", "발행 요청 내역이 없어요")
    return iss


def advance_issuance(db: Session, f: Funding, step: IssuanceStep, security_code: str | None = None,
                     trustee: str | None = None, listing_date: date | None = None, note: str | None = None) -> Issuance:
    _require(f, FundingStatus.ISSUING)
    iss = get_issuance(db, f)
    if step not in ISSUANCE_ORDER or ISSUANCE_ORDER.index(step) != ISSUANCE_ORDER.index(iss.step) + 1:
        raise Conflict("INVALID_ISSUANCE_STEP", f"{iss.step} 다음 단계가 아니에요")
    if step == IssuanceStep.ISSUED:
        if not (security_code and trustee):
            raise DomainError("ISSUANCE_INFO_REQUIRED", "증권 식별번호와 신탁·수탁 기관을 입력해 주세요")
        iss.security_code, iss.trustee = security_code, trustee
    if step == IssuanceStep.LISTING_SCHEDULED:
        if not listing_date:
            raise DomainError("ISSUANCE_INFO_REQUIRED", "상장일을 입력해 주세요")
        iss.listing_date = listing_date
    iss.step = step
    iss.history = [*iss.history, {"step": step, "at": clock.now().isoformat(), "note": note}]
    if step == IssuanceStep.LISTED:
        _list_security(db, f)
    return iss


def _list_security(db: Session, f: Funding) -> None:
    subs = list(db.scalars(select(Subscription).where(
        Subscription.funding_id == f.id, Subscription.status == SubscriptionStatus.ALLOCATED)))
    work = db.get(Work, f.work_id)
    total = 0
    for s in subs:  # 배정 조각 → 회원 보유 증권
        db.add(Holding(user_id=s.user_id, funding_id=f.id, mode=f.mode, units=s.allocated_units,
                       avg_price=f.unit_price))
        total += s.allocated_units * f.unit_price
        notify(db, s.user_id, "LISTED", f"「{work.title}」 조각이 상장됐어요", "이제 마켓에서 사고팔 수 있어요.",
               "funding", f.id)

    # 창작자 토큰: 전체 발행량의 creator_token_bps (투자자 배정분 위에 추가 발행), 보호예수 동안 매도 불가
    investor_units = sum(s.allocated_units for s in subs)
    creator_units = creator_token_units(investor_units, f.creator_token_bps)
    if creator_units:
        db.add(Holding(user_id=work.creator_id, funding_id=f.id, mode=f.mode, units=creator_units, avg_price=0,
                       locked_until=add_months(clock.now(), f.creator_lockup_months)))
        notify(db, work.creator_id, "CREATOR_TOKEN", f"「{work.title}」 창작자 토큰 {creator_units:,}조각을 받았어요",
               f"보호예수 {f.creator_lockup_months}개월 뒤부터 팔 수 있어요.", "funding", f.id)

    # 모금액 배분: 발행 실비 / 최소 유보금(신탁) / DIBS 운영비 / 작가 지급분(나머지)
    issuance_cost = total * f.issuance_cost_bps // 10000
    reserve = total * f.reserve_bps // 10000
    platform_fee = total * f.platform_fee_bps // 10000
    creator_total = total - issuance_cost - reserve - platform_fee
    legs = [
        Leg(ledger.sys(db, AccountKind.SYS_FUNDING_ESCROW, f.mode), -total),
        Leg(ledger.sys(db, AccountKind.SYS_ISSUANCE_COST, f.mode), issuance_cost),
        Leg(ledger.sys(db, AccountKind.SYS_PLATFORM_REVENUE, f.mode), platform_fee),
        Leg(ledger.sys(db, AccountKind.SYS_CREATOR_PAYABLE, f.mode), creator_total),
    ]
    if reserve:
        legs.append(Leg(ledger.sys(db, AccountKind.SYS_TRUST_RESERVE, f.mode), reserve))
    ledger.post(db, "LISTING_SETTLEMENT", legs, f.mode, "funding", f.id)

    schedules = list(db.scalars(select(PayoutSchedule).where(PayoutSchedule.funding_id == f.id)
                                .order_by(PayoutSchedule.seq)))
    assigned = 0
    for i, ps in enumerate(schedules):
        ps.amount = creator_total - assigned if i == len(schedules) - 1 else creator_total * ps.bps // 10000
        assigned += ps.amount
    for ps in schedules:
        if ps.trigger == PayoutTrigger.ON_LISTED:
            _pay(db, f, work, ps)

    f.status = FundingStatus.LISTED
    f.reference_price = f.last_price = f.unit_price  # 상장일 기준가 = 공모가
    f.listed_at = clock.now()
    serial.mark_listing(db, f)  # 시즌 진행 기준점
    f.exclusive_until = add_months(f.listed_at, f.exclusive_months)  # 이 날까지 DIBS 선공개 독점


def _pay(db: Session, f: Funding, work: Work, ps: PayoutSchedule) -> None:
    creator_acc = ledger.user_accounts(db, work.creator_id, f.mode)
    j = ledger.post(db, "CREATOR_PAYOUT", [
        Leg(ledger.sys(db, AccountKind.SYS_CREATOR_PAYABLE, f.mode), -ps.amount),
        Leg(creator_acc.deposit, ps.amount),
    ], f.mode, "payout_schedule", ps.id)
    ps.status, ps.paid_journal_id = PayoutStatus.PAID, j.id
    notify(db, work.creator_id, "CREATOR_PAYOUT", f"「{work.title}」 펀딩 지급금 {ps.amount:,}원이 들어왔어요",
           ref_type="funding", ref_id=f.id)


def pay_milestone(db: Session, f: Funding, seq: int) -> PayoutSchedule:
    return serial.pay_milestone(db, f, seq)


def fail_issuance(db: Session, f: Funding, reason: str) -> Funding:
    _require(f, FundingStatus.ALLOCATED, FundingStatus.ISSUING)
    subs = list(db.scalars(select(Subscription).where(
        Subscription.funding_id == f.id, Subscription.status == SubscriptionStatus.ALLOCATED)))
    work = db.get(Work, f.work_id)
    legs, total = [], 0
    for s in subs:
        amt = s.allocated_units * f.unit_price
        total += amt
        legs.append(Leg(ledger.user_accounts(db, s.user_id, f.mode).deposit, amt))
        s.status, s.assigned_tier_id = SubscriptionStatus.REFUNDED, None
        notify(db, s.user_id, "ISSUE_FAILED", f"「{work.title}」 증권 발행이 무산돼 전액 환불했어요",
               "리워드도 함께 취소됐어요.", "funding", f.id)
    if total:
        legs.append(Leg(ledger.sys(db, AccountKind.SYS_FUNDING_ESCROW, f.mode), -total))
        ledger.post(db, "ISSUE_FAILED_REFUND", legs, f.mode, "funding", f.id)
    iss = db.scalar(select(Issuance).where(Issuance.funding_id == f.id))
    if iss:
        iss.step, iss.failed_reason = IssuanceStep.FAILED, reason
        iss.history = [*iss.history, {"step": IssuanceStep.FAILED, "at": clock.now().isoformat(), "note": reason}]
    f.status = FundingStatus.ISSUE_FAILED
    return f


def creator_token_units(investor_units: int, creator_token_bps: int) -> int:
    """창작자 토큰 수량: 전체 발행량(투자자 + 창작자)의 creator_token_bps가 되도록 추가 발행한다.
    예) 투자자 9,500조각, 5% → 창작자 500조각 (전체 10,000조각 중 5%)."""
    if creator_token_bps <= 0 or investor_units <= 0:
        return 0
    return investor_units * creator_token_bps // (10000 - creator_token_bps)


def add_months(dt, months: int):
    y, m = divmod(dt.month - 1 + months, 12)
    year, month = dt.year + y, m + 1
    return dt.replace(year=year, month=month, day=min(dt.day, calendar.monthrange(year, month)[1]))


def _holders(db: Session, f: Funding) -> list[Holding]:
    return list(db.scalars(select(Holding).where(Holding.funding_id == f.id, Holding.mode == f.mode,
                                                 Holding.units > 0).order_by(Holding.user_id)))


def discontinue(db: Session, f: Funding, reason: str, kind: str = "NO_FAULT") -> dict:
    """연재 중단 확정: services/serial.py (불가피한 사유 / 작가 귀책)."""
    return serial.discontinue(db, f, reason, kind)


def breakeven(f: Funding, price_coin: int, monthly_episodes: int) -> list[dict]:
    """손익분기 규모 공시 (v5.0). 회수 전 투자자 몫(세후)으로 시즌 안·상품 기간 안에 원금을 돌려받는 데 필요한 규모.

    완결 후 매출은 연재 때보다 작으므로 시즌 매출 곡선으로 '연재 수준 환산 개월'을 쓴다.
    """
    out = []
    tax = 1 - settings.dividend_tax_bps / 10000
    holder = f.royalty_holder_bps / 10000
    curve = product.season_curve()
    for label, months in (("시즌 연재 기간 안에 원금 회수", settings.season_months),
                          ("상품 기간 안에 원금 회수", product.term_months())):
        eff = sum(curve[:months])  # 연재 수준으로 환산한 개월 수
        holder_need = f.target_amount / eff  # 연재 중 월 투자자 몫(세후)
        net_need = holder_need / tax / holder
        gross_need = net_need * 10000 / (10000 - settings.inapp_fee_bps)
        unlocks = gross_need / price_coin
        payers_per_ep = unlocks / monthly_episodes
        out.append({"goal": f"{label} ({months}개월)", "holder_dividend_per_year": round(holder_need * 12),
                    "net_revenue_per_year": round(net_need * 12), "paid_unlocks_per_month": round(unlocks),
                    "buyers_per_episode": round(payers_per_ep),
                    "monthly_readers": round(payers_per_ep / (settings.assumed_pay_rate_bps / 10000))})
    return out


def set_suspended(db: Session, f: Funding, suspended: bool, reason: str | None) -> Funding:
    """거래 정지 (권리 분쟁·제작 중단 등). 정지 시 미체결 주문은 MarketGateway 가 취소한다."""
    if suspended:
        _require(f, FundingStatus.LISTED)
        f.status = FundingStatus.SUSPENDED
    else:
        _require(f, FundingStatus.SUSPENDED)
        f.status = FundingStatus.LISTED
    f.review_note = reason
    return f
