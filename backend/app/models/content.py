from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core import clock
from app.core.db import Base
from app.models.base import TimestampMixin, enum_col
from app.models.enums import EventType, WorkStatus, WorkType


class Work(TimestampMixin, Base):
    """작품. 권리 확인(rights_*)은 등록 심사 때 운영자가 본다."""

    __tablename__ = "works"

    id: Mapped[int] = mapped_column(primary_key=True)
    creator_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    type: Mapped[WorkType] = enum_col(WorkType)
    genre: Mapped[str] = mapped_column(String(50), index=True)
    synopsis: Mapped[str] = mapped_column(Text, default="")
    cover_url: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[WorkStatus] = enum_col(WorkStatus, default=WorkStatus.DRAFT)
    rights_declared: Mapped[bool] = mapped_column(Boolean, default=False)  # 공개 권한 보유 확인
    prior_contract_note: Mapped[str | None] = mapped_column(Text)  # 기존 계약관계
    review_note: Mapped[str | None] = mapped_column(Text)

    episodes: Mapped[list["Episode"]] = relationship(back_populates="work", order_by="Episode.no")


class Episode(TimestampMixin, Base):
    __tablename__ = "episodes"
    __table_args__ = (UniqueConstraint("work_id", "no"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    work_id: Mapped[int] = mapped_column(ForeignKey("works.id"), index=True)
    no: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(200))
    content_url: Mapped[str] = mapped_column(String(500))  # 이미지 묶음/본문 저장 위치
    # v4.0: 파일럿 1~3화 무료, 이후 유료 미리보기(회당 300원)는 공개 21일 뒤 무료
    paid_preview: Mapped[bool] = mapped_column(Boolean, default=False)
    price_coin: Mapped[int] = mapped_column(Integer, default=0)
    free_unlock_at: Mapped[datetime | None] = mapped_column(DateTime)  # 이 시각부터 무료

    @property
    def is_paid(self) -> bool:
        """지금 결제가 필요한가 (유료 미리보기 기간 중)."""
        return self.paid_preview and (self.free_unlock_at is None or clock.now() < self.free_unlock_at)

    work: Mapped[Work] = relationship(back_populates="episodes")


class Short(TimestampMixin, Base):
    """1분 세로 숏츠."""

    __tablename__ = "shorts"

    id: Mapped[int] = mapped_column(primary_key=True)
    work_id: Mapped[int] = mapped_column(ForeignKey("works.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    video_url: Mapped[str] = mapped_column(String(500))
    duration_sec: Mapped[int] = mapped_column(Integer)


class Dib(Base):
    """찜(무료 관심 등록)."""

    __tablename__ = "dibs"
    __table_args__ = (UniqueConstraint("user_id", "work_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    work_id: Mapped[int] = mapped_column(ForeignKey("works.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=clock.now)


class EpisodeUnlock(Base):
    """유료 회차 열람권. 한 번 열면 계속 볼 수 있다. 배당 재원(PAID_EPISODE) 집계 원천."""

    __tablename__ = "episode_unlocks"
    __table_args__ = (UniqueConstraint("user_id", "episode_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    episode_id: Mapped[int] = mapped_column(ForeignKey("episodes.id"), index=True)
    work_id: Mapped[int] = mapped_column(ForeignKey("works.id"), index=True)
    price_coin: Mapped[int] = mapped_column(Integer)
    journal_id: Mapped[int] = mapped_column(ForeignKey("journals.id"))
    unlocked_at: Mapped[datetime] = mapped_column(DateTime, default=clock.now, index=True)


class ContentEvent(Base):
    """이용 데이터 원천 로그 (데이터 분석 팀과 스키마 공유).

    연독률·이탈 지점·숏츠→펀딩 전환 등은 모두 이 테이블에서 계산한다.
    """

    __tablename__ = "content_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    anon_id: Mapped[str | None] = mapped_column(String(64), index=True)  # 비로그인 기기 식별자
    session_id: Mapped[str | None] = mapped_column(String(64))
    event_type: Mapped[EventType] = enum_col(EventType, index=True)
    work_id: Mapped[int | None] = mapped_column(ForeignKey("works.id"), index=True)
    episode_id: Mapped[int | None] = mapped_column(ForeignKey("episodes.id"))
    short_id: Mapped[int | None] = mapped_column(ForeignKey("shorts.id"))
    funding_id: Mapped[int | None] = mapped_column(ForeignKey("fundings.id"))
    progress: Mapped[float | None] = mapped_column(Float)  # 0.0 ~ 1.0
    occurred_at: Mapped[datetime] = mapped_column(DateTime, index=True)  # 클라이언트 시각
    received_at: Mapped[datetime] = mapped_column(DateTime, default=clock.now)
    props: Mapped[dict] = mapped_column(JSON, default=dict)  # platform, app_version, referrer 등
