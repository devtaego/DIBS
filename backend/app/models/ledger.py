"""복식부기 원장.

- 모든 돈의 이동은 Journal 1건 + Posting N건 (합계 0) 으로 기록한다.
- 기록은 추가만 한다(append-only). 정정은 반대 분개로 한다.
- 잔액 = 해당 계정 Posting 합계. 회원 계정은 음수가 될 수 없다.
- 코인(COIN)과 예치금(DEPOSIT*)은 계정 종류로 분리되고, 코인→예치금 이동은 서비스 계층에서 금지한다.
- mode(MOCK/LIVE)가 다른 계정끼리는 같은 Journal 에 섞일 수 없다.
"""
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core import clock
from app.core.db import Base
from app.models.base import enum_col
from app.models.enums import AccountKind, Mode


class Account(Base):
    __tablename__ = "accounts"
    __table_args__ = (UniqueConstraint("kind", "owner_id", "mode"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[AccountKind] = enum_col(AccountKind)
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)  # 시스템 계정은 NULL
    mode: Mapped[Mode] = enum_col(Mode)


class Journal(Base):
    __tablename__ = "journals"

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(50), index=True)  # COIN_CHARGE, SUBSCRIPTION_LOCK, TRADE ...
    ref_type: Mapped[str | None] = mapped_column(String(50))
    ref_id: Mapped[int | None] = mapped_column(Integer)
    memo: Mapped[str | None] = mapped_column(String(255))
    mode: Mapped[Mode] = enum_col(Mode)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=clock.now, index=True)

    postings: Mapped[list["Posting"]] = relationship(back_populates="journal")


class Posting(Base):
    __tablename__ = "postings"

    id: Mapped[int] = mapped_column(primary_key=True)
    journal_id: Mapped[int] = mapped_column(ForeignKey("journals.id"), index=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    amount: Mapped[int] = mapped_column(BigInteger)  # 원 단위 정수. +입금 / -출금

    journal: Mapped[Journal] = relationship(back_populates="postings")


class WithdrawalRequest(Base):
    __tablename__ = "withdrawal_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    amount: Mapped[int] = mapped_column(BigInteger)
    mode: Mapped[Mode] = enum_col(Mode)
    status: Mapped[str] = mapped_column(String(20), default="PENDING")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=clock.now)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime)


class CoinLot(Base):
    """씨앗(코인) 출처별 묶음 (기획서 3-4-3). 잔액의 기준은 원장이고, 이 표는 출처·유효기간·환불 판단용 보조 장부다.

    source: IAP(인앱결제) | PG(카드·계좌 결제) | CONVERTED(예치금 전환) | BONUS(출석·묶음 보너스·쿠폰·포인트)
    """

    __tablename__ = "coin_lots"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    source: Mapped[str] = mapped_column(String(20))
    amount: Mapped[int] = mapped_column(BigInteger)
    remaining: Mapped[int] = mapped_column(BigInteger)
    paid_amount: Mapped[int] = mapped_column(BigInteger, default=0)  # 실제 결제 금액 (인앱은 스토어 수수료 보전분 포함)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")  # ACTIVE | USED | EXPIRED | REFUNDED
    package_id: Mapped[str | None] = mapped_column(String(30))
    parent_lot_id: Mapped[int | None] = mapped_column(ForeignKey("coin_lots.id"))  # 묶음 보너스 → 함께 산 유료 묶음
    journal_id: Mapped[int | None] = mapped_column(ForeignKey("journals.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=clock.now)
