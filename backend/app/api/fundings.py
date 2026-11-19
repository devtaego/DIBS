from datetime import timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import clock
from app.core.config import settings
from app.core.db import get_db
from app.core.errors import DomainError, NotFound
from app.core.security import creator_only, current_user
from app.models import Funding, Subscription, User, Work
from app.models.enums import FundingStatus
from app.schemas.common import LimitsOut
from app.schemas.funding import (
    BreakevenOut,
    FundingApplyIn,
    FundingGateOut,
    FundingCardOut,
    FundingDetailOut,
    FundingOut,
    FundingProgress,
    FundingTermsOut,
    RecoupOut,
    RewardTierOut,
    SubscribeIn,
    SubscriptionOut,
    SubscriptionPatch,
    TerminationOut,
)
from app.services import content as content_svc
from app.services import funding as svc
from app.services import product
from app.services.policy import remaining_limits

router = APIRouter(tags=["fundings"])

PUBLIC_STATUSES = [FundingStatus.OPEN, FundingStatus.FAILED, FundingStatus.ALLOCATED, FundingStatus.ISSUING,
                   FundingStatus.ISSUE_FAILED, FundingStatus.LISTED, FundingStatus.SUSPENDED, FundingStatus.TERMINATED]


def card(db: Session, f: Funding, work: Work | None = None) -> dict:
    work = work or db.get(Work, f.work_id)
    days_left = None
    if f.status == FundingStatus.OPEN and f.close_at:
        days_left = max(0, (f.close_at.date() - clock.now().date()).days)
    return {**FundingOut.model_validate(f).model_dump(), "work_title": work.title, "cover_url": work.cover_url,
            "progress": FundingProgress(**svc.funding_progress(db, f)), "days_left": days_left}


def detail(db: Session, f: Funding) -> FundingDetailOut:
    work = db.get(Work, f.work_id)
    return FundingDetailOut(
        **FundingOut.model_validate(f).model_dump(),
        work_title=work.title, use_of_funds=f.use_of_funds, risk_note=f.risk_note,
        terms=FundingTermsOut.model_validate(f),
        reward_tiers=[RewardTierOut.model_validate(t) for t in f.reward_tiers],
        progress=FundingProgress(**svc.funding_progress(db, f)),
        lock_at=f.close_at - timedelta(minutes=settings.subscription_lock_minutes) if f.close_at else None,
        per_user_cap_units=product.per_user_cap_units(f),
        recoup=RecoupOut(**product.recoup_status(db, f)),
        termination=TerminationOut(**product.termination_check(db, f)) if f.listed_at else None,
    )


@router.get("/fundings", response_model=list[FundingCardOut], summary="펀딩 목록 (카드: 작품명·달성률·D-day)")
def list_fundings(status: FundingStatus | None = Query(default=FundingStatus.OPEN),
                  limit: int = Query(default=20, le=100), offset: int = 0, db: Session = Depends(get_db)):
    stmt = select(Funding).where(Funding.status.in_(PUBLIC_STATUSES))
    if status:
        stmt = stmt.where(Funding.status == status)
    return [FundingCardOut(**card(db, f)) for f in db.scalars(stmt.order_by(Funding.close_at).limit(limit).offset(offset))]


@router.get("/fundings/{funding_id}", response_model=FundingDetailOut, summary="펀딩 상세 (조건·달성률·리워드)")
def get_funding(funding_id: int, db: Session = Depends(get_db)):
    f = svc.get_funding(db, funding_id)
    if f.status not in PUBLIC_STATUSES:
        raise NotFound("FUNDING_NOT_FOUND", "펀딩을 찾을 수 없어요")
    return detail(db, f)


@router.post("/works/{work_id}/fundings", response_model=FundingDetailOut, status_code=201,
             summary="펀딩 신청 (창작자) → 운영자 심사 대기")
def apply(work_id: int, body: FundingApplyIn, db: Session = Depends(get_db), user: User = Depends(creator_only)):
    w = content_svc.get_work(db, work_id, user)
    data = body.model_dump(exclude={"reward_tiers"})
    f = svc.apply_funding(db, user, w, data, [t.model_dump() for t in body.reward_tiers])
    db.refresh(f)
    return detail(db, f)


@router.get("/fundings/{funding_id}/limits", response_model=LimitsOut, summary="내 남은 투자 한도")
def my_limits(funding_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    f = svc.get_funding(db, funding_id)
    return LimitsOut(mode=f.mode, **remaining_limits(db, user, f.mode, f.id))


@router.post("/fundings/{funding_id}/subscriptions", response_model=SubscriptionOut, status_code=201,
             summary="조각 청약 (예치금 묶임)")
def subscribe(funding_id: int, body: SubscribeIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if not body.agree_risk_notice:
        raise DomainError("RISK_NOTICE_REQUIRED", "투자 위험 고지에 동의해 주세요")
    if not body.agree_termination_rule:
        raise DomainError("TERMINATION_NOTICE_REQUIRED", "만기 없음·종료 규칙 고지에 동의해 주세요")
    f = svc.get_funding(db, funding_id)
    consents = {"investment-risk": "2026-11-19", "termination-rule": "2026-11-19"}
    return svc.subscribe(db, user, f, body.units, body.reward_tier_id, body.shipping, consents)


@router.get("/fundings/{funding_id}/breakeven", response_model=BreakevenOut, summary="손익분기 독자 규모 (청약 전 공시)")
def breakeven(funding_id: int, price_coin: int = Query(default=300, gt=0), monthly_episodes: int = Query(default=4, gt=0),
              db: Session = Depends(get_db)):
    f = svc.get_funding(db, funding_id)
    if f.status not in PUBLIC_STATUSES:
        raise NotFound("FUNDING_NOT_FOUND", "펀딩을 찾을 수 없어요")
    return BreakevenOut(funding_id=f.id, target_amount=f.target_amount, price_coin=price_coin,
                        monthly_episodes=monthly_episodes, inapp_fee_bps=settings.inapp_fee_bps,
                        royalty_holder_bps=f.royalty_holder_bps, lines=svc.breakeven(f, price_coin, monthly_episodes))


@router.get("/works/{work_id}/funding-gate", response_model=FundingGateOut,
            summary="펀딩 개설 조건·목표 금액 상한 (파일럿 4주 열람자 기준)")
def funding_gate(work_id: int, target_amount: int = Query(default=50_000_000, gt=0), db: Session = Depends(get_db)):
    content_svc.get_work(db, work_id)
    return FundingGateOut(work_id=work_id, target_amount=target_amount,
                          **product.funding_gate(db, work_id, target_amount))


@router.get("/fundings/{funding_id}/buyback-quote", response_model=TerminationOut,
            summary="종료 규칙 상태와 작가 매입가 (상장 후)")
def buyback_quote(funding_id: int, db: Session = Depends(get_db)):
    f = svc.get_funding(db, funding_id)
    if not f.listed_at:
        raise NotFound("NOT_LISTED", "상장 후에 확인할 수 있어요")
    return TerminationOut(**product.termination_check(db, f))


@router.post("/fundings/{funding_id}/buyback", summary="작가 매입 옵션 실행 (작가 본인, 전량 매입 후 권리 종료)")
def buyback(funding_id: int, db: Session = Depends(get_db), user: User = Depends(creator_only)):
    from app.services.market.mock_exchange import get_market

    f = svc.get_funding(db, funding_id)
    get_market(db).cancel_all(f)
    return product.buyback(db, f, user.id)


@router.get("/fundings/{funding_id}/subscriptions/me", response_model=SubscriptionOut, summary="내 청약 조회")
def my_subscription(funding_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    sub = db.scalar(select(Subscription).where(Subscription.funding_id == funding_id, Subscription.user_id == user.id))
    if sub is None:
        raise NotFound("SUBSCRIPTION_NOT_FOUND", "청약 내역이 없어요")
    return sub


@router.patch("/fundings/{funding_id}/subscriptions/me", response_model=SubscriptionOut,
              summary="청약 수량·리워드 변경 (감액은 마감 1시간 전까지)")
def change(funding_id: int, body: SubscriptionPatch, db: Session = Depends(get_db), user: User = Depends(current_user)):
    f = svc.get_funding(db, funding_id)
    return svc.change_subscription(db, user, f, body.units, body.reward_tier_id, body.shipping)


@router.delete("/fundings/{funding_id}/subscriptions/me", response_model=SubscriptionOut,
               summary="청약 취소 (마감 1시간 전까지)")
def cancel(funding_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return svc.cancel_subscription(db, user, svc.get_funding(db, funding_id))
