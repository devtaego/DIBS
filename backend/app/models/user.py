from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core import clock
from app.core.config import settings
from app.core.db import Base
from app.models.base import TimestampMixin, enum_col
from app.models.enums import InvestorType, Role


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    nickname: Mapped[str] = mapped_column(String(50))
    role: Mapped[Role] = enum_col(Role, default=Role.READER)
    investor_type: Mapped[InvestorType] = enum_col(InvestorType, default=InvestorType.GENERAL)
    kyc_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    bio: Mapped[str] = mapped_column(Text, default="")  # 작가 프로필 소개
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    # 투자성향 확인 (v3.0): 청약·매수 전 필수
    risk_level: Mapped[str | None] = mapped_column(String(20))  # STABLE | STABLE_SEEKING | NEUTRAL | ACTIVE | AGGRESSIVE
    risk_checked_at: Mapped[datetime | None] = mapped_column(DateTime)
    no_investment_experience: Mapped[bool] = mapped_column(Boolean, default=False)  # 투자성향 1번 문항 '없어요'
    # 제휴 증권사 계좌 연결 (모의). 전체 계좌번호는 저장하지 않음
    broker_name: Mapped[str | None] = mapped_column(String(50))
    broker_account_masked: Mapped[str | None] = mapped_column(String(30))
    account_changed_at: Mapped[datetime | None] = mapped_column(DateTime)  # 계좌 변경 시각 (24시간 출금 금지)
    birth_date: Mapped[date | None] = mapped_column(Date)  # 본인인증 결과의 생년월일 (만 나이 확인용)

    def age(self, today: date) -> int | None:
        if self.birth_date is None:
            return None
        b = self.birth_date
        return today.year - b.year - ((today.month, today.day) < (b.month, b.day))

    def is_adult(self, today: date) -> bool:
        a = self.age(today)
        return a is not None and a >= settings.adult_age

    @property
    def level(self) -> str:
        """기획서 2-2 회원 인증 단계. L1 가입 / L2 본인인증 / L3 투자 가능(L2 + 만 19세 + 투자성향 + 계좌 연결)."""
        if not self.kyc_verified:
            return "L1"
        if self.is_adult(clock.now().date()) and self.risk_checked_at and self.broker_account_masked:
            return "L3"
        return "L2"


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    type: Mapped[str] = mapped_column(String(50))  # FUNDING_FAILED, ALLOCATED, REWARD_CHANGED, DIVIDEND_PAID ...
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, default="")
    ref_type: Mapped[str | None] = mapped_column(String(50))
    ref_id: Mapped[int | None] = mapped_column(Integer)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=clock.now)
