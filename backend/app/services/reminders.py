"""마감 임박 알림 (매일 실행).

모집 중인 펀딩의 마감이 REMIND_DAYS 일 안으로 들어오면
- 청약한 회원: 「작품」 청약이 D-n 마감이에요 (수량 바꾸기·취소는 마감 1시간 전까지)
- 찜만 하고 청약하지 않은 회원: 찜한 「작품」 청약이 D-n 마감이에요
같은 펀딩·같은 종류 알림은 회원당 한 번만 보낸다.
"""
from math import ceil

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import clock
from app.models import Dib, Funding, Notification, Subscription, Work
from app.models.enums import FundingStatus, SubscriptionStatus
from app.services.policy import notify

REMIND_DAYS = 2


def _sent(db: Session, user_id: int, type_: str, funding_id: int) -> bool:
    return db.scalar(select(Notification.id).where(Notification.user_id == user_id, Notification.type == type_,
                                                   Notification.ref_type == "funding", Notification.ref_id == funding_id)) is not None


def deadline_reminders(db: Session) -> dict:
    now = clock.now()
    sent = 0
    for f in db.scalars(select(Funding).where(Funding.status == FundingStatus.OPEN, Funding.close_at.is_not(None))):
        left = (f.close_at - now).total_seconds() / 86400
        if left < 0 or left > REMIND_DAYS:
            continue
        work = db.get(Work, f.work_id)
        d = f"D-{max(1, ceil(left))}" if left >= 1 else "오늘"
        subs = {s.user_id for s in db.scalars(select(Subscription).where(Subscription.funding_id == f.id, Subscription.status == SubscriptionStatus.ACTIVE))}
        for uid in subs:
            if not _sent(db, uid, "DEADLINE_SOON", f.id):
                notify(db, uid, "DEADLINE_SOON", f"「{work.title}」 청약 마감 {d}",
                       "수량 바꾸기·취소는 마감 1시간 전까지 할 수 있어요.", "funding", f.id)
                sent += 1
        for uid in db.scalars(select(Dib.user_id).where(Dib.work_id == f.work_id)):
            if uid in subs or _sent(db, uid, "DIBBED_DEADLINE_SOON", f.id):
                continue
            notify(db, uid, "DIBBED_DEADLINE_SOON", f"찜한 「{work.title}」 청약 마감 {d}",
                   "마감 전에 조각을 담아 보세요. 1조각 1만 원부터예요.", "funding", f.id)
            sent += 1
    return {"sent": sent}
