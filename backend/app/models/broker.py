"""증권사 연계 (B안). 계좌번호·실명·연계정보(CI)는 저장하지 않고 증권사가 발급한 가명 연결 식별자만 둔다."""
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core import clock
from app.core.db import Base


class BrokerLink(Base):
    """DIBS 회원 ↔ 증권사 연결 식별자."""

    __tablename__ = "broker_links"
    __table_args__ = (UniqueConstraint("broker", "link_ref"), UniqueConstraint("broker", "user_id"))

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    broker: Mapped[str] = mapped_column(String(20))
    link_ref: Mapped[str] = mapped_column(String(64))  # 증권사가 발급한 가명 id
    is_new_account: Mapped[bool] = mapped_column(Boolean, default=False)  # DIBS를 통해 처음 연 계좌
    coupon_coin: Mapped[int] = mapped_column(Integer, default=0)  # 지급한 계좌 개설 쿠폰 코인
    linked_at: Mapped[datetime] = mapped_column(DateTime, default=clock.now)
    unlinked_at: Mapped[datetime | None] = mapped_column(DateTime)


class BrokerEvent(Base):
    """증권사 웹훅 수신 기록. event_id 로 중복 처리를 막는다 (재전송 안전)."""

    __tablename__ = "broker_events"
    __table_args__ = (UniqueConstraint("broker", "event_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    broker: Mapped[str] = mapped_column(String(20))
    event_id: Mapped[str] = mapped_column(String(64))
    event_type: Mapped[str] = mapped_column(String(40), index=True)
    funding_id: Mapped[int | None] = mapped_column(ForeignKey("fundings.id"), index=True)
    payload: Mapped[dict] = mapped_column(JSON)
    received_at: Mapped[datetime] = mapped_column(DateTime, default=clock.now)


class BrokerOfferingState(Base):
    """증권사가 알려 준 청약 현황(집계)과 분배 완료 상태. 개인별 청약 내역은 받지 않는다."""

    __tablename__ = "broker_offering_states"
    __table_args__ = (UniqueConstraint("broker", "funding_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    broker: Mapped[str] = mapped_column(String(20))
    funding_id: Mapped[int] = mapped_column(ForeignKey("fundings.id"))
    subscribed_units: Mapped[int] = mapped_column(Integer, default=0)
    participants: Mapped[int] = mapped_column(Integer, default=0)
    allocated_units: Mapped[int] = mapped_column(Integer, default=0)
    registry_as_of: Mapped[datetime | None] = mapped_column(DateTime)
    holder_registry: Mapped[dict] = mapped_column(JSON, default=dict)  # {link_ref: units} 분기 기준일 보유자 명부
    paid_runs: Mapped[dict] = mapped_column(JSON, default=dict)  # {run_id: {"gross":…, "tax":…}}
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=clock.now, onupdate=clock.now)


class BrokerNotice(Base):
    """DIBS → 증권사 알림 (증권사가 서명 요청으로 가져감). 연재 지연·중단·완결·특별 분배."""

    __tablename__ = "broker_notices"

    id: Mapped[int] = mapped_column(primary_key=True)
    broker: Mapped[str] = mapped_column(String(20))
    funding_id: Mapped[int] = mapped_column(ForeignKey("fundings.id"), index=True)
    kind: Mapped[str] = mapped_column(String(40))  # SERIAL_DELAY_WARNING | DISCONTINUED | SEASON_COMPLETED | SPECIAL_DISTRIBUTION | HIATUS
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=clock.now)
