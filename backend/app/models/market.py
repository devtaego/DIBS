from datetime import date, datetime

from sqlalchemy import BigInteger, Date, DateTime, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core import clock
from app.core.db import Base
from app.models.base import TimestampMixin, enum_col
from app.models.enums import Mode, OrderSide, OrderStatus


class Holding(TimestampMixin, Base):
    """보유 증권 (회원 × 종목 × 모드)."""

    __tablename__ = "holdings"
    __table_args__ = (UniqueConstraint("user_id", "funding_id", "mode"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    funding_id: Mapped[int] = mapped_column(ForeignKey("fundings.id"), index=True)
    mode: Mapped[Mode] = enum_col(Mode)
    units: Mapped[int] = mapped_column(Integer, default=0)
    locked_units: Mapped[int] = mapped_column(Integer, default=0)  # 매도 주문으로 묶인 수량
    avg_price: Mapped[int] = mapped_column(Integer, default=0)


class Order(TimestampMixin, Base):
    """지정가 주문. 같은 가격끼리만 체결(상대매매)."""

    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    funding_id: Mapped[int] = mapped_column(ForeignKey("fundings.id"), index=True)
    mode: Mapped[Mode] = enum_col(Mode)
    side: Mapped[OrderSide] = enum_col(OrderSide)
    price: Mapped[int] = mapped_column(Integer)
    units: Mapped[int] = mapped_column(Integer)
    remaining_units: Mapped[int] = mapped_column(Integer)
    status: Mapped[OrderStatus] = enum_col(OrderStatus, default=OrderStatus.OPEN, index=True)
    fee_ppm: Mapped[int] = mapped_column(Integer)  # 거래 수수료율 (100만분의 1, 0.015% = 150)
    locked_amount: Mapped[int] = mapped_column(BigInteger, default=0)  # 매수: 남은 묶인 예치금
    trade_date: Mapped[date] = mapped_column(Date, index=True)  # 자정 자동 취소 기준일


class Trade(Base):
    __tablename__ = "trades"

    id: Mapped[int] = mapped_column(primary_key=True)
    funding_id: Mapped[int] = mapped_column(ForeignKey("fundings.id"), index=True)
    mode: Mapped[Mode] = enum_col(Mode)
    price: Mapped[int] = mapped_column(Integer)
    units: Mapped[int] = mapped_column(Integer)
    buy_order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"))
    sell_order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"))
    buyer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    seller_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    buy_fee: Mapped[int] = mapped_column(BigInteger)
    sell_fee: Mapped[int] = mapped_column(BigInteger)
    journal_id: Mapped[int] = mapped_column(ForeignKey("journals.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=clock.now, index=True)
