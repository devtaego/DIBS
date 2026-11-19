from datetime import date, datetime

from sqlalchemy import BigInteger, Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core import clock
from app.core.db import Base
from app.models.base import enum_col
from app.models.enums import DividendStatus, RevenueSource


class RevenueRecord(Base):
    """상장 작품의 DIBS 안 매출 (배당 재원). 2차 IP 사업 수익은 대상이 아님."""

    __tablename__ = "revenue_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    funding_id: Mapped[int] = mapped_column(ForeignKey("fundings.id"), index=True)
    period: Mapped[str] = mapped_column(String(7), index=True)  # "2027Q1"
    source: Mapped[RevenueSource] = enum_col(RevenueSource)
    gross: Mapped[int] = mapped_column(BigInteger)
    deductions: Mapped[int] = mapped_column(BigInteger, default=0)  # 인앱 수수료, 굿즈 원가·배송비
    net: Mapped[int] = mapped_column(BigInteger)
    note: Mapped[str | None] = mapped_column(Text)
    evidence_url: Mapped[str | None] = mapped_column(String(500))  # 증빙
    created_at: Mapped[datetime] = mapped_column(DateTime, default=clock.now)


class DividendRun(Base):
    __tablename__ = "dividend_runs"
    __table_args__ = (UniqueConstraint("funding_id", "period"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    funding_id: Mapped[int] = mapped_column(ForeignKey("fundings.id"), index=True)
    period: Mapped[str] = mapped_column(String(7))
    record_date: Mapped[date] = mapped_column(Date)  # 기준일 = 분기 말일
    pay_date: Mapped[date] = mapped_column(Date)  # 다음 달 10일
    net_revenue: Mapped[int] = mapped_column(BigInteger)  # 순매출 (작가·투자자·DIBS 로 나눔)
    phase: Mapped[str] = mapped_column(String(20), default="BEFORE_RECOUP")  # BEFORE_RECOUP | AFTER_RECOUP
    recouped_now: Mapped[bool] = mapped_column(Boolean, default=False)  # 이 분기로 원금 회수 달성
    holder_pool: Mapped[int] = mapped_column(BigInteger)
    creator_amount: Mapped[int] = mapped_column(BigInteger)
    platform_amount: Mapped[int] = mapped_column(BigInteger)
    residual: Mapped[int] = mapped_column(BigInteger, default=0)  # 원 단위 절사 잔여 (플랫폼 귀속)
    total_units: Mapped[int] = mapped_column(Integer)
    per_unit_gross: Mapped[float] = mapped_column()  # 표시용 (주당 배당금)
    status: Mapped[DividendStatus] = enum_col(DividendStatus, default=DividendStatus.CALCULATED)
    journal_id: Mapped[int | None] = mapped_column(ForeignKey("journals.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=clock.now)


class DividendPayment(Base):
    __tablename__ = "dividend_payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("dividend_runs.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    units: Mapped[int] = mapped_column(Integer)
    gross: Mapped[int] = mapped_column(BigInteger)
    tax: Mapped[int] = mapped_column(BigInteger)
    net: Mapped[int] = mapped_column(BigInteger)
