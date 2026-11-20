from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core import clock
from app.core.errors import DomainError, NotFound
from app.core.security import current_user
from app.models import (
    Dib,
    DividendPayment,
    DividendRun,
    Funding,
    Holding,
    Notification,
    Order,
    RewardTier,
    Subscription,
    User,
    Work,
)
from app.schemas.common import OK, BrokerAccountIn, LimitsOut, NotificationOut, ProfilePatch, RiskProfileIn, UserOut
from app.schemas.content import WorkOut
from app.schemas.funding import MySubscriptionOut, SubscriptionOut
from app.schemas.market import DividendPaymentOut, HoldingOut, OrderOut
from app.services.policy import current_mode, remaining_limits

router = APIRouter(prefix="/me", tags=["me"])


@router.get("", response_model=UserOut, summary="내 정보")
def me(user: User = Depends(current_user)):
    return user


@router.patch("", response_model=UserOut, summary="프로필 수정")
def patch_me(body: ProfilePatch, db: Session = Depends(get_db), user: User = Depends(current_user)):
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(user, k, v)
    return user


@router.post("/risk-profile", response_model=UserOut, summary="투자성향 확인 (청약·매수 전 필수)")
def risk_profile(body: RiskProfileIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if any(a not in (1, 2, 3, 4) for a in body.answers):
        raise DomainError("INVALID_ANSWERS", "각 문항은 1~4점이에요")
    score = sum(body.answers)  # 5~20
    # 5단계 (금융투자협회 표준 투자자 성향 분류에 맞춤): 5~7 안정형 · 8~10 안정추구형 · 11~13 위험중립형 · 14~16 적극투자형 · 17~20 공격투자형
    user.risk_level = ("STABLE" if score <= 7 else "STABLE_SEEKING" if score <= 10 else "NEUTRAL" if score <= 13
                       else "ACTIVE" if score <= 16 else "AGGRESSIVE")
    user.risk_checked_at = clock.now()
    user.no_investment_experience = body.answers[0] == 1  # 1번 '투자 경험' = 없어요 → 소액 한도
    return user


@router.put("/broker-account", response_model=UserOut, summary="제휴 증권사 계좌 연결 (모의)")
def broker_account(body: BrokerAccountIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    digits = body.account_no.replace("-", "")
    user.broker_name, user.broker_account_masked = body.broker_name, f"****{digits[-4:]}"
    return user


@router.get("/limits", response_model=LimitsOut, summary="연간 투자 한도")
def limits(db: Session = Depends(get_db), user: User = Depends(current_user)):
    mode = current_mode()
    return LimitsOut(mode=mode, **remaining_limits(db, user, mode))


@router.get("/dibs", response_model=list[WorkOut], summary="찜한 작품")
def my_dibs(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return list(db.scalars(select(Work).join(Dib, Dib.work_id == Work.id).where(Dib.user_id == user.id)
                           .order_by(Dib.created_at.desc())))


@router.get("/subscriptions", response_model=list[MySubscriptionOut], summary="청약 내역 (작품명·배정·리워드·배송)")
def my_subscriptions(db: Session = Depends(get_db), user: User = Depends(current_user)):
    rows = db.execute(select(Subscription, Funding, Work.title).join(Funding, Funding.id == Subscription.funding_id)
                      .join(Work, Work.id == Funding.work_id).where(Subscription.user_id == user.id)
                      .order_by(Subscription.id.desc())).all()
    tier_ids = {i for s, _, _ in rows for i in (s.requested_tier_id, s.assigned_tier_id) if i}
    titles = dict(db.execute(select(RewardTier.id, RewardTier.title).where(RewardTier.id.in_(tier_ids))).all()) if tier_ids else {}
    return [MySubscriptionOut(**SubscriptionOut.model_validate(s).model_dump(), work_title=t, unit_price=f.unit_price,
                              funding_status=f.status, close_at=f.close_at,
                              requested_tier_title=titles.get(s.requested_tier_id),
                              assigned_tier_title=titles.get(s.assigned_tier_id),
                              tracking_carrier=s.tracking_carrier, tracking_no=s.tracking_no)
            for s, f, t in rows]


@router.get("/holdings", response_model=list[HoldingOut], summary="보유 조각·평가손익")
def my_holdings(db: Session = Depends(get_db), user: User = Depends(current_user)):
    rows = db.execute(select(Holding, Funding, Work.title).join(Funding, Funding.id == Holding.funding_id)
                      .join(Work, Work.id == Funding.work_id)
                      .where(Holding.user_id == user.id, Holding.units > 0)).all()
    out = []
    for h, f, title in rows:
        price = f.last_price or f.unit_price
        ev, cost = h.units * price, h.units * h.avg_price
        out.append(HoldingOut(funding_id=f.id, work_title=title, mode=h.mode, units=h.units,
                              locked_units=h.locked_units, avg_price=h.avg_price, last_price=f.last_price,
                              eval_amount=ev, pnl=ev - cost, pnl_pct=round((ev - cost) * 100 / cost, 2) if cost else None))
    return out


@router.get("/orders", response_model=list[OrderOut], summary="주문 내역")
def my_orders(open_only: bool = False, limit: int = Query(default=50, le=200),
              db: Session = Depends(get_db), user: User = Depends(current_user)):
    stmt = select(Order).where(Order.user_id == user.id)
    if open_only:
        stmt = stmt.where(Order.status.in_(["OPEN", "PARTIAL"]))
    return list(db.scalars(stmt.order_by(Order.id.desc()).limit(limit)))


@router.get("/dividends", response_model=list[DividendPaymentOut], summary="정산 리포트 (분기 배당 내역)")
def my_dividends(db: Session = Depends(get_db), user: User = Depends(current_user)):
    rows = db.execute(select(DividendPayment, DividendRun, Work.title)
                      .join(DividendRun, DividendRun.id == DividendPayment.run_id)
                      .join(Funding, Funding.id == DividendRun.funding_id)
                      .join(Work, Work.id == Funding.work_id)
                      .where(DividendPayment.user_id == user.id)
                      .order_by(DividendRun.period.desc())).all()
    return [DividendPaymentOut(run_id=r.id, funding_id=r.funding_id, work_title=t, period=r.period, pay_date=r.pay_date,
                               status=r.status, units=p.units, gross=p.gross, tax=p.tax, net=p.net)
            for p, r, t in rows]


@router.get("/notifications", response_model=list[NotificationOut], summary="알림")
def my_notifications(unread_only: bool = False, limit: int = Query(default=50, le=200),
                     db: Session = Depends(get_db), user: User = Depends(current_user)):
    stmt = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        stmt = stmt.where(Notification.is_read.is_(False))
    return list(db.scalars(stmt.order_by(Notification.id.desc()).limit(limit)))


@router.post("/notifications/{notification_id}/read", response_model=OK, summary="알림 읽음")
def read_notification(notification_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    n = db.get(Notification, notification_id)
    if n is None or n.user_id != user.id:
        raise NotFound("NOTIFICATION_NOT_FOUND", "알림을 찾을 수 없어요")
    n.is_read = True
    return OK()
