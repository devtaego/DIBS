"""공통 정책 검사: 모의/실거래 스위치, 투자 한도, 알림."""
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core import clock
from app.core.config import settings
from app.core.errors import DomainError
from app.models import Funding, Notification, Order, Subscription, Trade, User
from app.models.enums import InvestorType, Mode, OrderSide, OrderStatus, SubscriptionStatus


def current_mode() -> Mode:
    return Mode(settings.trading_mode)


def ensure_mode_allowed(mode: Mode) -> None:
    if mode == Mode.LIVE and not settings.live_trading_enabled:
        raise DomainError("LIVE_DISABLED", "실거래는 인가 후 열려요. 지금은 모의투자만 가능해요", 409)


def limits_for(user: User) -> tuple[int, int]:
    if user.investor_type == InvestorType.QUALIFIED:
        return settings.annual_limit_qualified, settings.per_security_limit_qualified
    return settings.annual_limit_general, settings.per_security_limit_general


def investment_usage(db: Session, user_id: int, mode: Mode, year: int, funding_id: int | None = None) -> int:
    """올해 투자 사용액 = 청약(활성·배정분) + 체결 매수 + 미체결 매수 주문.

    ※ 법령안은 '연간 순매수' 기준. 매도분 차감 여부는 기획 확정 필요 (OPEN_DECISIONS.md).
    """
    start = clock.now().replace(year=year, month=1, day=1, hour=0, minute=0, second=0)
    end = start.replace(year=year + 1)

    sub_q = (
        select(Subscription, Funding.unit_price)
        .join(Funding, Funding.id == Subscription.funding_id)
        .where(
            Subscription.user_id == user_id,
            Funding.mode == mode,
            Subscription.status.in_([SubscriptionStatus.ACTIVE, SubscriptionStatus.ALLOCATED]),
            Subscription.first_subscribed_at >= start,
            Subscription.first_subscribed_at < end,
        )
    )
    if funding_id is not None:
        sub_q = sub_q.where(Subscription.funding_id == funding_id)
    used = 0
    for sub, price in db.execute(sub_q):
        units = sub.allocated_units if sub.status == SubscriptionStatus.ALLOCATED else sub.units
        used += (units or 0) * price

    trade_q = select(func.coalesce(func.sum(Trade.price * Trade.units), 0)).where(
        Trade.buyer_id == user_id, Trade.mode == mode, Trade.created_at >= start, Trade.created_at < end
    )
    order_q = select(func.coalesce(func.sum(Order.price * Order.remaining_units), 0)).where(
        Order.user_id == user_id,
        Order.mode == mode,
        Order.side == OrderSide.BUY,
        Order.status.in_([OrderStatus.OPEN, OrderStatus.PARTIAL]),
    )
    if funding_id is not None:
        trade_q = trade_q.where(Trade.funding_id == funding_id)
        order_q = order_q.where(Order.funding_id == funding_id)
    used += int(db.scalar(trade_q)) + int(db.scalar(order_q))
    return used


def check_investment_limit(db: Session, user: User, mode: Mode, funding_id: int, add_amount: int) -> None:
    if add_amount <= 0:
        return
    annual, per_security = limits_for(user)
    year = clock.now().year
    if investment_usage(db, user.id, mode, year) + add_amount > annual:
        raise DomainError("ANNUAL_LIMIT_EXCEEDED", f"연간 투자 한도({annual:,}원)를 넘어요")
    if investment_usage(db, user.id, mode, year, funding_id) + add_amount > per_security:
        raise DomainError("SECURITY_LIMIT_EXCEEDED", f"종목당 투자 한도({per_security:,}원)를 넘어요")


def remaining_limits(db: Session, user: User, mode: Mode, funding_id: int | None = None) -> dict:
    annual, per_security = limits_for(user)
    year = clock.now().year
    out = {"annual_limit": annual, "annual_remaining": max(0, annual - investment_usage(db, user.id, mode, year))}
    if funding_id is not None:
        used = investment_usage(db, user.id, mode, year, funding_id)
        out |= {"security_limit": per_security, "security_remaining": max(0, per_security - used)}
    return out


def notify(db: Session, user_id: int, type_: str, title: str, body: str = "",
           ref_type: str | None = None, ref_id: int | None = None) -> None:
    db.add(Notification(user_id=user_id, type=type_, title=title, body=body, ref_type=ref_type, ref_id=ref_id))
