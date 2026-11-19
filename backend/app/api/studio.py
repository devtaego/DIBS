"""크리에이터 스튜디오 (웹). 창작자 본인 작품·펀딩만 보인다."""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.fundings import card, detail
from app.core import clock
from app.core.db import get_db
from app.core.errors import Conflict, NotFound
from app.core.security import creator_only
from app.models import DividendRun, Funding, PayoutSchedule, RewardTier, Subscription, User, Work
from app.models.enums import PayoutStatus, Role, SubscriptionStatus
from app.schemas.content import WorkAdminOut, WorkOut
from app.schemas.funding import (
    FundingDetailOut,
    PayoutOut,
    RoyaltyLine,
    SettlementOut,
    ShipmentIn,
    ShipmentOut,
    StudioFundingOut,
)
from app.services import funding as svc
from app.services.policy import notify

router = APIRouter(prefix="/studio", tags=["studio"])


def _my_funding(db: Session, user: User, funding_id: int) -> Funding:
    f = svc.get_funding(db, funding_id)
    if user.role != Role.ADMIN and db.get(Work, f.work_id).creator_id != user.id:
        raise NotFound("FUNDING_NOT_FOUND", "펀딩을 찾을 수 없어요")
    return f


def _my_fundings(db: Session, user: User) -> list[tuple[Funding, Work]]:
    return list(db.execute(select(Funding, Work).join(Work, Work.id == Funding.work_id)
                           .where(Work.creator_id == user.id).order_by(Funding.id.desc())).all())


@router.get("/works", response_model=list[WorkAdminOut], summary="내 작품 (작성 중·심사 중·반려 포함)")
def my_works(db: Session = Depends(get_db), user: User = Depends(creator_only)):
    works = db.scalars(select(Work).where(Work.creator_id == user.id).order_by(Work.id.desc()))
    return [WorkAdminOut(**WorkOut.model_validate(w).model_dump(), rights_declared=w.rights_declared,
                         prior_contract_note=w.prior_contract_note, review_note=w.review_note,
                         episode_count=len(w.episodes)) for w in works]


@router.get("/fundings", response_model=list[StudioFundingOut], summary="내 펀딩 (심사 중·반려 포함, 달성률)")
def my_fundings(db: Session = Depends(get_db), user: User = Depends(creator_only)):
    return [StudioFundingOut(**card(db, f, w), review_note=f.review_note) for f, w in _my_fundings(db, user)]


@router.get("/fundings/{funding_id}", response_model=FundingDetailOut, summary="내 펀딩 상세 (모든 상태)")
def my_funding(funding_id: int, db: Session = Depends(get_db), user: User = Depends(creator_only)):
    return detail(db, _my_funding(db, user, funding_id))


@router.get("/fundings/{funding_id}/shipments", response_model=list[ShipmentOut], summary="리워드 배송 대상")
def shipments(funding_id: int, db: Session = Depends(get_db), user: User = Depends(creator_only)):
    """배정이 확정된(ALLOCATED) 청약 중 리워드가 배정된 회원만. 배송지는 배송 목적 외 사용 금지."""
    f = _my_funding(db, user, funding_id)
    rows = db.execute(select(Subscription, RewardTier, User.nickname)
                      .join(RewardTier, RewardTier.id == Subscription.assigned_tier_id)
                      .join(User, User.id == Subscription.user_id)
                      .where(Subscription.funding_id == f.id, Subscription.status == SubscriptionStatus.ALLOCATED)
                      .order_by(Subscription.first_subscribed_at, Subscription.id)).all()
    return [ShipmentOut(subscription_id=s.id, user_id=s.user_id, nickname=nick, tier_id=t.id, tier_title=t.title,
                        allocated_units=s.allocated_units, shipping=s.shipping if t.requires_shipping else None,
                        tracking_carrier=s.tracking_carrier, tracking_no=s.tracking_no, shipped_at=s.shipped_at)
            for s, t, nick in rows]


@router.put("/fundings/{funding_id}/shipments/{subscription_id}", response_model=ShipmentOut, summary="송장 입력")
def ship(funding_id: int, subscription_id: int, body: ShipmentIn, db: Session = Depends(get_db),
         user: User = Depends(creator_only)):
    f = _my_funding(db, user, funding_id)
    s = db.get(Subscription, subscription_id)
    if s is None or s.funding_id != f.id or not s.assigned_tier_id or s.status != SubscriptionStatus.ALLOCATED:
        raise NotFound("SHIPMENT_NOT_FOUND", "배송 대상이 아니에요")
    t = db.get(RewardTier, s.assigned_tier_id)
    if not t.requires_shipping:
        raise Conflict("SHIPPING_NOT_REQUIRED", "배송이 필요 없는 리워드예요")
    s.tracking_carrier, s.tracking_no, s.shipped_at = body.carrier, body.tracking_no, clock.now()
    notify(db, s.user_id, "REWARD_SHIPPED", f"'{t.title}' 리워드가 발송됐어요", f"{body.carrier} {body.tracking_no}",
           "funding", f.id)
    nick = db.get(User, s.user_id).nickname
    return ShipmentOut(subscription_id=s.id, user_id=s.user_id, nickname=nick, tier_id=t.id, tier_title=t.title,
                       allocated_units=s.allocated_units, shipping=s.shipping, tracking_carrier=s.tracking_carrier,
                       tracking_no=s.tracking_no, shipped_at=s.shipped_at)


@router.get("/settlements", response_model=list[SettlementOut], summary="정산 (펀딩 지급분 + 분기 저작권료)")
def settlements(db: Session = Depends(get_db), user: User = Depends(creator_only)):
    out = []
    for f, w in _my_fundings(db, user):
        payouts = list(db.scalars(select(PayoutSchedule).where(PayoutSchedule.funding_id == f.id)
                                  .order_by(PayoutSchedule.seq)))
        runs = list(db.scalars(select(DividendRun).where(DividendRun.funding_id == f.id)
                               .order_by(DividendRun.period.desc())))
        if not payouts and not runs:
            continue
        paid = sum(p.amount or 0 for p in payouts if p.status == PayoutStatus.PAID)
        paid += sum(r.creator_amount for r in runs if r.status == "PAID")
        out.append(SettlementOut(
            funding_id=f.id, work_title=w.title, funding_status=f.status,
            payouts=[PayoutOut.model_validate(p) for p in payouts],
            royalties=[RoyaltyLine(period=r.period, pay_date=r.pay_date, net_revenue=r.net_revenue,
                                   creator_amount=r.creator_amount, status=r.status) for r in runs],
            paid_total=paid))
    return out
