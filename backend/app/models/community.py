from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core import clock
from app.core.db import Base
from app.models.base import TimestampMixin, enum_col
from app.models.enums import PostKind


class Post(TimestampMixin, Base):
    """댓글·게시판·팬아트·주주 게시판을 한 테이블로 (kind 로 구분, parent_id 로 답글).

    v3.0 원칙: 투자자에게 창작 개입권 없음. 주주 게시판(HOLDER_BOARD)은 작품 댓글과 분리하고 보유자만 쓴다.
    """

    __tablename__ = "posts"

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[PostKind] = enum_col(PostKind, index=True)
    work_id: Mapped[int] = mapped_column(ForeignKey("works.id"), index=True)
    episode_id: Mapped[int | None] = mapped_column(ForeignKey("episodes.id"))
    short_id: Mapped[int | None] = mapped_column(ForeignKey("shorts.id"))
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("posts.id"), index=True)  # 답글
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    body: Mapped[str] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(String(500))  # 팬아트
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False)  # 신고 누적·운영자 숨김
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)


class PostReport(Base):
    __tablename__ = "post_reports"
    __table_args__ = (UniqueConstraint("post_id", "reporter_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("posts.id"), index=True)
    reporter_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    reason: Mapped[str] = mapped_column(String(50))  # ABUSE | SPAM | CREATIVE_PRESSURE(창작 개입 압박) | OTHER
    created_at: Mapped[datetime] = mapped_column(DateTime, default=clock.now)


class UserBlock(Base):
    __tablename__ = "user_blocks"
    __table_args__ = (UniqueConstraint("user_id", "blocked_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    blocked_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=clock.now)


class Notice(TimestampMixin, Base):
    __tablename__ = "notices"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(30), default="GENERAL")  # GENERAL | DISCLOSURE(공시) | MAINTENANCE
    funding_id: Mapped[int | None] = mapped_column(ForeignKey("fundings.id"))  # 종목 공시일 때
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False)


