"""내부 모의 상대매매 엔진.

규칙 (기획안 v2.0 STEP 5)
1. 지정가 주문만, 같은 가격끼리만 체결 (가격 우선이 아니라 '가격 일치' + 시간 우선)
2. 가격제한폭: 기준가(전일 종가) ±30%. 상장일 기준가 = 공모가
3. 24시간 거래, 매일 04:00~04:30 점검, 미체결 주문은 자정에 자동 취소
4. 수수료: 매수·매도 0.015% (v4.0). 거래소·증권사 몫이며 DIBS 수입이 아니다 (발행·유통 분리)
5. 자기 주문끼리는 체결하지 않음 (자전거래 방지)
6. 매수는 투자성향 확인 후 가능 (v3.0)
"""
import math
from datetime import date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import clock
from app.core.config import settings
from app.core.errors import Conflict, DomainError, Forbidden, NotFound
from app.models import Funding, Holding, Order, Trade, User, Work
from app.models.enums import AccountKind, FundingStatus, OrderSide, OrderStatus
from app.services import ledger
from app.services.ledger import Leg
from app.services.market.gateway import MarketGateway
from app.services.policy import check_investment_limit, ensure_mode_allowed, remaining_limits

OPEN_STATUSES = (OrderStatus.OPEN, OrderStatus.PARTIAL)


def _hm(s: str) -> time:
    h, m = s.split(":")
    return time(int(h), int(m))


def in_maintenance(at: datetime) -> bool:
    return _hm(settings.maintenance_start) <= at.time() < _hm(settings.maintenance_end)


def price_band(reference_price: int) -> tuple[int, int]:
    bps = settings.price_limit_bps
    return (math.ceil(reference_price * (10000 - bps) / 10000), math.floor(reference_price * (10000 + bps) / 10000))


def trade_fee(gross: int, fee_ppm: int | None = None) -> int:
    return gross * (settings.trade_fee_ppm if fee_ppm is None else fee_ppm) // 1_000_000


class InternalMockExchange(MarketGateway):
    def __init__(self, db: Session):
        self.db = db

    # ── 주문 ──
    def place_order(self, user: User, funding: Funding, side: OrderSide, price: int, units: int) -> Order:
        db, f = self.db, funding
        now = clock.now()
        if f.status != FundingStatus.LISTED:
            raise Conflict("NOT_TRADABLE", "거래할 수 없는 종목이에요 (미상장 또는 거래 정지)")
        ensure_mode_allowed(f.mode)
        if in_maintenance(now):
            raise Conflict("MARKET_MAINTENANCE", f"{settings.maintenance_start}~{settings.maintenance_end} 점검 중이에요")
        if not user.kyc_verified:
            raise Forbidden("KYC_REQUIRED", "본인인증 후 거래할 수 있어요")
        if side == OrderSide.BUY and not user.risk_checked_at:
            raise Forbidden("RISK_PROFILE_REQUIRED", "투자성향 확인 후 매수할 수 있어요")
        if db.get(Work, f.work_id).creator_id == user.id:
            raise Forbidden("SELF_TRADE_FORBIDDEN", "창작자는 자기 작품 조각을 거래할 수 없어요")
        if units < 1 or price < 1:
            raise DomainError("INVALID_ORDER", "가격과 수량은 1 이상이어야 해요")
        lo, hi = price_band(f.reference_price)
        if not lo <= price <= hi:
            raise DomainError("PRICE_OUT_OF_BAND", f"주문 가능 가격은 {lo:,}~{hi:,}원이에요")

        order = Order(user_id=user.id, funding_id=f.id, mode=f.mode, side=side, price=price, units=units,
                      remaining_units=units, trade_date=now.date(), fee_ppm=settings.trade_fee_ppm)
        if side == OrderSide.BUY:
            gross = price * units
            check_investment_limit(db, user, f.mode, f.id, gross)
            lock = gross + trade_fee(gross, order.fee_ppm)
            order.locked_amount = lock
            db.add(order)
            db.flush()
            acc = ledger.user_accounts(db, user.id, f.mode)
            ledger.post(db, "ORDER_LOCK", [Leg(acc.deposit, -lock), Leg(acc.locked, lock)], f.mode, "order", order.id)
        else:
            h = self._holding(user.id, f)
            if h is None or h.units - h.locked_units < units:
                raise DomainError("INSUFFICIENT_UNITS", "매도 가능 수량이 부족해요")
            h.locked_units += units
            db.add(order)
            db.flush()

        self._match(order, f)
        return order

    def _match(self, order: Order, f: Funding) -> None:
        opposite = OrderSide.SELL if order.side == OrderSide.BUY else OrderSide.BUY
        counters = self.db.scalars(
            select(Order).where(
                Order.funding_id == f.id, Order.mode == f.mode, Order.side == opposite,
                Order.price == order.price, Order.status.in_(OPEN_STATUSES), Order.user_id != order.user_id,
            ).order_by(Order.created_at, Order.id)
        ).all()
        for c in counters:
            if order.remaining_units == 0:
                break
            q = min(order.remaining_units, c.remaining_units)
            buy, sell = (order, c) if order.side == OrderSide.BUY else (c, order)
            self._fill(f, buy, sell, q, order.price)

    def _fill(self, f: Funding, buy: Order, sell: Order, q: int, price: int) -> None:
        db = self.db
        gross = price * q
        buy_fee, sell_fee = trade_fee(gross, buy.fee_ppm), trade_fee(gross, sell.fee_ppm)
        b_acc = ledger.user_accounts(db, buy.user_id, f.mode)
        s_acc = ledger.user_accounts(db, sell.user_id, f.mode)

        buy.remaining_units -= q
        sell.remaining_units -= q
        buy.locked_amount -= gross + buy_fee
        legs = [
            Leg(b_acc.locked, -(gross + buy_fee)),
            Leg(s_acc.deposit, gross - sell_fee),
            Leg(ledger.sys(db, AccountKind.SYS_BROKER_FEE, f.mode), buy_fee + sell_fee),  # 거래소·증권사 몫
        ]
        if buy.remaining_units == 0 and buy.locked_amount > 0:  # 수수료 절사 차액 반환
            legs += [Leg(b_acc.locked, -buy.locked_amount), Leg(b_acc.deposit, buy.locked_amount)]
            buy.locked_amount = 0
        j = ledger.post(db, "TRADE", legs, f.mode, "funding", f.id)

        seller_h = self._holding(sell.user_id, f)
        seller_h.units -= q
        seller_h.locked_units -= q
        buyer_h = self._holding(buy.user_id, f) or Holding(user_id=buy.user_id, funding_id=f.id, mode=f.mode,
                                                           units=0, avg_price=0)
        if buyer_h.id is None:
            db.add(buyer_h)
        buyer_h.avg_price = (buyer_h.units * buyer_h.avg_price + gross) // (buyer_h.units + q)
        buyer_h.units += q

        for o in (buy, sell):
            o.status = OrderStatus.FILLED if o.remaining_units == 0 else OrderStatus.PARTIAL
        db.add(Trade(funding_id=f.id, mode=f.mode, price=price, units=q, buy_order_id=buy.id, sell_order_id=sell.id,
                     buyer_id=buy.user_id, seller_id=sell.user_id, buy_fee=buy_fee, sell_fee=sell_fee,
                     journal_id=j.id))
        f.last_price = price
        db.flush()

    def _holding(self, user_id: int, f: Funding) -> Holding | None:
        return self.db.scalar(select(Holding).where(
            Holding.user_id == user_id, Holding.funding_id == f.id, Holding.mode == f.mode))

    def preview_order(self, user: User, funding: Funding, side: OrderSide, price: int, units: int) -> dict:
        db, f = self.db, funding
        reasons: list[str] = []
        if f.status != FundingStatus.LISTED:
            reasons.append("NOT_TRADABLE")
        if in_maintenance(clock.now()):
            reasons.append("MARKET_MAINTENANCE")
        if not user.kyc_verified:
            reasons.append("KYC_REQUIRED")
        if side == OrderSide.BUY and not user.risk_checked_at:
            reasons.append("RISK_PROFILE_REQUIRED")
        if db.get(Work, f.work_id).creator_id == user.id:
            reasons.append("SELF_TRADE_FORBIDDEN")
        lo, hi = price_band(f.reference_price) if f.reference_price else (None, None)
        if lo is not None and not lo <= price <= hi:
            reasons.append("PRICE_OUT_OF_BAND")

        gross = price * units
        fee_ppm = settings.trade_fee_ppm
        fee = trade_fee(gross, fee_ppm)
        acc = ledger.user_accounts(db, user.id, f.mode)
        deposit = ledger.balance(db, acc.deposit)
        h = self._holding(user.id, f)
        avail_units = (h.units - h.locked_units) if h else 0
        lim = remaining_limits(db, user, f.mode, f.id)
        if side == OrderSide.BUY:
            if gross + fee > deposit:
                reasons.append("INSUFFICIENT_BALANCE")
            if gross > lim["annual_remaining"]:
                reasons.append("ANNUAL_LIMIT_EXCEEDED")
            elif gross > lim["security_remaining"]:
                reasons.append("SECURITY_LIMIT_EXCEEDED")
        elif units > avail_units:
            reasons.append("INSUFFICIENT_UNITS")
        return {
            "mode": f.mode, "side": side, "price": price, "units": units, "gross": gross, "fee_ppm": fee_ppm,
            "fee": fee, "total": gross + fee if side == OrderSide.BUY else gross - fee,
            "price_band": {"min": lo, "max": hi}, "available_deposit": deposit, "available_units": avail_units,
            "annual_remaining": lim["annual_remaining"], "security_remaining": lim["security_remaining"],
            "can_place": not reasons, "reasons": reasons,
        }

    def daily_candles(self, funding: Funding, days: int = 30) -> list[dict]:
        since = datetime.combine(clock.now().date() - timedelta(days=days - 1), time.min)
        trades = self.db.scalars(select(Trade).where(Trade.funding_id == funding.id, Trade.mode == funding.mode,
                                                     Trade.created_at >= since).order_by(Trade.created_at, Trade.id))
        candles: dict[date, dict] = {}
        for t in trades:
            d = t.created_at.date()
            c = candles.get(d)
            if c is None:
                candles[d] = {"date": d, "open": t.price, "high": t.price, "low": t.price, "close": t.price,
                              "volume": t.units, "value": t.price * t.units}
            else:
                c["high"], c["low"], c["close"] = max(c["high"], t.price), min(c["low"], t.price), t.price
                c["volume"] += t.units
                c["value"] += t.price * t.units
        return [candles[d] for d in sorted(candles)]

    # ── 취소·만료 ──
    def _release(self, o: Order, status: OrderStatus) -> None:
        f = self.db.get(Funding, o.funding_id)
        if o.side == OrderSide.BUY and o.locked_amount > 0:
            acc = ledger.user_accounts(self.db, o.user_id, o.mode)
            ledger.post(self.db, "ORDER_UNLOCK", [Leg(acc.locked, -o.locked_amount), Leg(acc.deposit, o.locked_amount)],
                        o.mode, "order", o.id)
            o.locked_amount = 0
        elif o.side == OrderSide.SELL:
            self._holding(o.user_id, f).locked_units -= o.remaining_units
        o.status = status

    def cancel_order(self, user: User, order_id: int) -> Order:
        o = self.db.get(Order, order_id)
        if o is None or o.user_id != user.id:
            raise NotFound("ORDER_NOT_FOUND", "주문을 찾을 수 없어요")
        if o.status not in OPEN_STATUSES:
            raise Conflict("ORDER_NOT_OPEN", "이미 체결되었거나 취소된 주문이에요")
        self._release(o, OrderStatus.CANCELLED)
        return o

    def expire_orders(self, today: date) -> int:
        orders = self.db.scalars(select(Order).where(Order.status.in_(OPEN_STATUSES), Order.trade_date < today)).all()
        for o in orders:
            self._release(o, OrderStatus.EXPIRED)
        return len(orders)

    def cancel_all(self, funding: Funding) -> int:
        orders = self.db.scalars(select(Order).where(Order.funding_id == funding.id,
                                                     Order.status.in_(OPEN_STATUSES))).all()
        for o in orders:
            self._release(o, OrderStatus.CANCELLED)
        return len(orders)

    def roll_reference_prices(self) -> int:
        fs = self.db.scalars(select(Funding).where(Funding.status.in_([FundingStatus.LISTED, FundingStatus.SUSPENDED]))).all()
        for f in fs:
            f.reference_price = f.last_price or f.reference_price
        return len(fs)

    # ── 조회 ──
    def order_book(self, funding: Funding, depth: int = 10) -> dict:
        rows = self.db.scalars(select(Order).where(Order.funding_id == funding.id, Order.mode == funding.mode,
                                                   Order.status.in_(OPEN_STATUSES))).all()
        book: dict[OrderSide, dict[int, list]] = {OrderSide.BUY: {}, OrderSide.SELL: {}}
        for o in rows:
            lvl = book[o.side].setdefault(o.price, [0, 0])
            lvl[0] += o.remaining_units
            lvl[1] += 1

        def levels(side, reverse):
            return [{"price": p, "units": v[0], "orders": v[1]}
                    for p, v in sorted(book[side].items(), reverse=reverse)][:depth]

        lo, hi = price_band(funding.reference_price) if funding.reference_price else (None, None)
        return {"bids": levels(OrderSide.BUY, True), "asks": levels(OrderSide.SELL, False),
                "reference_price": funding.reference_price, "last_price": funding.last_price,
                "price_band": {"min": lo, "max": hi}}

    def recent_trades(self, funding: Funding, limit: int = 50) -> list[Trade]:
        return list(self.db.scalars(select(Trade).where(Trade.funding_id == funding.id)
                                    .order_by(Trade.created_at.desc(), Trade.id.desc()).limit(limit)))


def get_market(db: Session) -> MarketGateway:
    """나중에 설정값으로 외부 거래소 어댑터를 고르도록 확장."""
    return InternalMockExchange(db)
