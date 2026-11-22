from datetime import date, datetime

from sqlalchemy import JSON, BigInteger, Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core import clock
from app.core.db import Base
from app.models.base import enum_col
from app.models.enums import DividendStatus, RevenueSource


class RevenueRecord(Base):
    """상장 작품의 배당 재원 매출. 1차(연재)와 2차·해외(판권료·로열티·인세·굿즈·해외 연재·해외 선급금)."""

    __tablename__ = "revenue_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    funding_id: Mapped[int] = mapped_column(ForeignKey("fundings.id"), index=True)
    period: Mapped[str] = mapped_column(String(7), index=True)  # "2027Q1"
    source: Mapped[RevenueSource] = enum_col(RevenueSource)
    gross: Mapped[int] = mapped_column(BigInteger)
    deductions: Mapped[int] = mapped_column(BigInteger, default=0)  # 1차: 인앱 수수료 등 · 2차: 외부 직접비 합계
    income_type: Mapped[str | None] = mapped_column(String(30))  # 2차·해외 수입 종류 (SecondaryIncome)
    direct_costs: Mapped[dict | None] = mapped_column(JSON)  # 2차 외부 직접비 내역 {legal, translation, localization}
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
    net_revenue: Mapped[int] = mapped_column(BigInteger)  # 순매출 합계 (1차 + 2차)
    secondary_revenue: Mapped[int] = mapped_column(BigInteger, default=0)  # 그중 2차 IP·해외 (40 / 25 / 35로 나눈 몫)
    phase: Mapped[str] = mapped_column(String(20), default="BEFORE_RECOUP")  # BEFORE_RECOUP | AFTER_RECOUP
    recouped_now: Mapped[bool] = mapped_column(Boolean, default=False)  # 이 분기로 원금 회수 달성
    holder_pool: Mapped[int] = mapped_column(BigInteger)
    creator_amount: Mapped[int] = mapped_column(BigInteger)
    platform_amount: Mapped[int] = mapped_column(BigInteger)
    residual: Mapped[int] = mapped_column(BigInteger, default=0)  # 원 단위 절사 잔여 (플랫폼 귀속)
    creator_escrow: Mapped[int] = mapped_column(BigInteger, default=0)  # 작가 몫 중 이번 분기 유보분
    escrow_released: Mapped[int] = mapped_column(BigInteger, default=0)  # 회수 달성으로 작가에게 푼 유보금
    clawback_applied: Mapped[int] = mapped_column(BigInteger, default=0)  # 귀책 반환 청구로 투자자에게 돌린 작가 몫
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
