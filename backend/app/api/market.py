from datetime import timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core import clock
from app.core.db import get_db
from app.core.errors import DomainError, NotFound
from app.core.security import current_user, optional_user
from app.models import DividendRun, Funding, Holding, Issuance, Subscription, Trade, User, Work
from app.models.enums import DividendStatus, FundingStatus, OrderSide, SubscriptionStatus
from app.schemas.market import (
    CandleOut,
    DividendRunOut,
    OrderBookOut,
    OrderIn,
    OrderOut,
    OrderPreviewOut,
    SecurityDetailOut,
    SecurityListItem,
    TradeOut,
)
from app.services import funding as funding_svc
from app.services import product
from app.services.market.mock_exchange import get_market, price_band

router = APIRouter(prefix="/market", tags=["market"])

TRADABLE_VIEW = [FundingStatus.LISTED, FundingStatus.SUSPENDED, FundingStatus.TERMINATED]


def _security(db: Session, funding_id: int) -> Funding:
    f = funding_svc.get_funding(db, funding_id)
    if f.status not in TRADABLE_VIEW:
        raise NotFound("SECURITY_NOT_FOUND", "상장 종목이 아니에요")
    return f


def _list_item(f: Funding, title: str) -> SecurityListItem:
    chg = round((f.last_price - f.reference_price) * 100 / f.reference_price, 2) if f.reference_price else None
    return SecurityListItem(funding_id=f.id, work_id=f.work_id, work_title=title, status=f.status,
                            unit_price=f.unit_price, reference_price=f.reference_price,
                            last_price=f.last_price, change_pct=chg)


@router.get("/securities", response_model=list[SecurityListItem], summary="상장 종목 목록 (마켓 순위)")
def securities(sort: str = Query(default="change", pattern="^(change|latest)$"), db: Session = Depends(get_db)):
    rows = db.execute(select(Funding, Work.title).join(Work, Work.id == Funding.work_id)
                      .where(Funding.status.in_(TRADABLE_VIEW))).all()
    items = [_list_item(f, title) for f, title in rows]
    key = (lambda i: -(i.change_pct or 0)) if sort == "change" else (lambda i: -i.funding_id)
    return sorted(items, key=key)


@router.get("/securities/{funding_id}", response_model=SecurityDetailOut, summary="종목 상세 (현재가·발행 정보·배당·내 보유)")
def security_detail(funding_id: int, db: Session = Depends(get_db), user: User | None = Depends(optional_user)):
    f = _security(db, funding_id)
    work = db.get(Work, f.work_id)
    iss = db.scalar(select(Issuance).where(Issuance.funding_id == f.id))
    total_units = sum(db.scalars(select(Subscription.allocated_units).where(
        Subscription.funding_id == f.id, Subscription.status == SubscriptionStatus.ALLOCATED)))
    # 확정 분기만 (v_work_quarterly.quarter_status = 확정): 지급까지 끝난 회차, 진행 중인 분기는 제외
    now_q = f"{clock.now().year}Q{(clock.now().month - 1) // 3 + 1}"
    runs = list(db.scalars(select(DividendRun).where(DividendRun.funding_id == f.id,
                                                     DividendRun.status == DividendStatus.PAID,
                                                     DividendRun.period < now_q)
                           .order_by(DividendRun.period.desc())))
    lo, hi = price_band(f.reference_price)
    vol, cnt = db.execute(select(func.coalesce(func.sum(Trade.units), 0), func.count()).where(
        Trade.funding_id == f.id, Trade.created_at >= clock.now() - timedelta(days=7))).one()
    div4 = round(sum(r.per_unit_gross for r in runs[:4]), 2)
    price = f.last_price or f.unit_price
    rec, term = product.recoup_status(db, f), product.termination_check(db, f)
    mine = None
    if user:
        mine = db.scalar(select(Holding).where(Holding.user_id == user.id, Holding.funding_id == f.id,
                                               Holding.mode == f.mode))
    return SecurityDetailOut(
        **_list_item(f, work.title).model_dump(), security_code=iss.security_code if iss else None,
        listed_at=f.listed_at, total_units=total_units, price_band={"min": lo, "max": hi},
        royalty_holder_bps=rec["holder_bps_now"],
        cumulative_dividend_per_unit=round(sum(r.per_unit_gross for r in runs), 2),
        last_dividend=DividendRunOut.model_validate(runs[0]) if runs else None,
        volume_7d=int(vol), trades_7d=cnt, dividend_4q_per_unit=div4,
        price_to_dividend=round(price / div4, 1) if div4 else None,
        last_dist_per_token=runs[0].per_unit_gross if runs else None,
        last_dist_period=runs[0].period if runs else None,
        annual_dist_yield=round(div4 / price, 6) if div4 and price else None,
        recoup_phase=rec["phase"], recoup_progress_pct=rec["progress_pct"],
        royalty_holder_after_bps=f.royalty_holder_after_bps, buyback_price=term["buyback_price"], buyback_enabled=term["buyback_enabled"],
        terminate_due_at=term["terminate_due_at"],
        my_units=mine.units if mine else (0 if user else None), my_avg_price=mine.avg_price if mine else None,
    )


@router.get("/securities/{funding_id}/chart", response_model=list[CandleOut], summary="일봉 차트 (체결 기준)")
def chart(funding_id: int, days: int = Query(default=30, ge=1, le=365), db: Session = Depends(get_db)):
    return get_market(db).daily_candles(_security(db, funding_id), days)


@router.get("/securities/{funding_id}/order-preview", response_model=OrderPreviewOut,
            summary="주문 확인 시트 (수수료·총액·주문 가능 여부)")
def order_preview(funding_id: int, side: OrderSide, price: int = Query(gt=0), units: int = Query(gt=0),
                  db: Session = Depends(get_db), user: User = Depends(current_user)):
    return get_market(db).preview_order(user, _security(db, funding_id), side, price, units)


@router.get("/securities/{funding_id}/orderbook", response_model=OrderBookOut, summary="호가 (가격별 잔량)")
def orderbook(funding_id: int, depth: int = Query(default=10, le=50), db: Session = Depends(get_db)):
    return get_market(db).order_book(_security(db, funding_id), depth)


@router.get("/securities/{funding_id}/trades", response_model=list[TradeOut], summary="최근 체결")
def trades(funding_id: int, limit: int = Query(default=50, le=200), db: Session = Depends(get_db)):
    return get_market(db).recent_trades(_security(db, funding_id), limit)


@router.get("/securities/{funding_id}/dividends", response_model=list[DividendRunOut], summary="종목 배당 내역")
def dividends(funding_id: int, db: Session = Depends(get_db)):
    f = _security(db, funding_id)
    return list(db.scalars(select(DividendRun).where(DividendRun.funding_id == f.id).order_by(DividendRun.period.desc())))


@router.post("/orders", response_model=OrderOut, status_code=201, summary="주문 (지정가 또는 시장가)")
def place(body: OrderIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if not body.agree_risk_notice:
        raise DomainError("RISK_NOTICE_REQUIRED", "투자 위험 고지를 확인해 주세요")
    f = _security(db, body.funding_id)
    if body.order_type == "MARKET":
        return get_market(db).place_market_order(user, f, body.side, body.units)
    if body.price is None:
        raise DomainError("INVALID_ORDER", "지정가 주문은 가격을 입력해 주세요")
    return get_market(db).place_order(user, f, body.side, body.price, body.units)


@router.delete("/orders/{order_id}", response_model=OrderOut, summary="주문 취소")
def cancel(order_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return get_market(db).cancel_order(user, order_id)
