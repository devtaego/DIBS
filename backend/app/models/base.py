from datetime import datetime

from sqlalchemy import DateTime, Enum
from sqlalchemy.orm import Mapped, mapped_column

from app.core import clock


def enum_col(enum_cls, **kw):
    """DB 에는 문자열로 저장 (DB 네이티브 ENUM 미사용 → 값 추가 시 마이그레이션 부담 적음)."""
    return mapped_column(Enum(enum_cls, native_enum=False, length=32, validate_strings=True), **kw)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=clock.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=clock.now, onupdate=clock.now)
