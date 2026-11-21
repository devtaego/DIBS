"""열람 리워드: 출석 코인, 제휴 증권사(키움 모의) 포인트 → 코인 전환.

원칙: 리워드는 모두 '코인'(유료 회차 열람 전용)으로만 준다.
코인은 예치금으로 바꿀 수 없고 청약·매매에 쓸 수 없다 → 투자 권유·유인 소지를 만들지 않는다.
방향은 한쪽뿐: 증권사 포인트 → DIBS 코인 (반대 방향 없음).
"""
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core import clock
from app.core.config import settings
from app.core.errors import DomainError
from app.models import Journal, User
from app.models.enums import AccountKind
from app.services import coins, ledger
from app.services.ledger import Leg
from app.services.policy import notify
from app.services.wallet import COIN_MODE

# 디비 발자국 출석 (화면설계도 13 MY): 매일 10P, 7일째 해바라기 보너스 +100P. 하루 빠지면 1일째부터 다시.
# 1P = 1원어치 보너스 씨앗이라 100P = 씨앗 1개 (90일 뒤 만료). 7일이면 170P, 한 달 약 700P(씨앗 7개 ≈ 미리보기 2화)
LADDER = [10, 10, 10, 10, 10, 10, 110]
STREAK_DAYS = len(LADDER)
POINT_START = 3_000  # 시연 계정의 키움 포인트 잔액 (제휴 API 전까지 고정값)
POINT_UNIT = 100  # 100P 단위, 1P = 1코인


def _days(db: Session, user: User) -> set[date]:
    rows = db.scalars(select(Journal.memo).where(Journal.kind == "ATTENDANCE", Journal.ref_type == "user", Journal.ref_id == user.id))
    return {date.fromisoformat(m[:10]) for m in rows if m}


def _streak(days: set[date], today: date) -> int:
    d, n = today if today in days else today - timedelta(days=1), 0
    while d in days:
        n, d = n + 1, d - timedelta(days=1)
    return n


def attendance(db: Session, user: User) -> dict:
    today = clock.now().date()
    days = _days(db, user)
    streak = _streak(days, today)
    checked = today in days
    done = (streak - 1) % STREAK_DAYS + 1 if (checked and streak) else streak % STREAK_DAYS  # 이번 주기에서 채운 칸
    return {"today": today.isoformat(), "checked": checked, "streak": streak, "ladder": LADDER, "filled": done,
            "today_coin": LADDER[(done - 1) if checked else done], "week_total": sum(LADDER)}


def attend(db: Session, user: User) -> dict:
    today = clock.now().date()
    days = _days(db, user)
    if today in days:
        raise DomainError("ALREADY_ATTENDED", "오늘은 이미 출석했어요. 내일 또 만나요!")
    streak = _streak(days | {today}, today)
    amt = LADDER[(streak - 1) % STREAK_DAYS]
    coin = ledger.get_account(db, AccountKind.COIN, COIN_MODE, user.id)
    j = ledger.post(db, "ATTENDANCE", [Leg(ledger.sys(db, AccountKind.SYS_PROMOTION, COIN_MODE), -amt), Leg(coin, amt)],
                    COIN_MODE, "user", user.id, memo=f"{today.isoformat()} 출석 {streak}일째")
    coins.credit(db, user.id, "BONUS", amt, j)
    return {**attendance(db, user), "granted": amt}


def _converted(db: Session, user: User) -> int:
    from app.models import Posting
    total = db.scalar(select(func.coalesce(func.sum(Posting.amount), 0)).join(Journal, Posting.journal_id == Journal.id)
                      .where(Journal.kind == "PARTNER_POINT", Journal.ref_type == "user", Journal.ref_id == user.id, Posting.amount > 0))
    return int(total or 0)


def partner_points(db: Session, user: User) -> dict:
    used = _converted(db, user)
    return {"broker": "키움증권", "balance": max(0, POINT_START - used), "converted": used, "unit": POINT_UNIT, "rate": 1}


def convert_points(db: Session, user: User, points: int) -> dict:
    if points <= 0 or points % POINT_UNIT:
        raise DomainError("BAD_POINTS", f"{POINT_UNIT}P 단위로 바꿀 수 있어요")
    if points > partner_points(db, user)["balance"]:
        raise DomainError("NOT_ENOUGH_POINTS", "키움 포인트가 모자라요")
    coin = ledger.get_account(db, AccountKind.COIN, COIN_MODE, user.id)
    j = ledger.post(db, "PARTNER_POINT", [Leg(ledger.sys(db, AccountKind.SYS_PARTNER_POINT, COIN_MODE), -points), Leg(coin, points)],
                    COIN_MODE, "user", user.id, memo=f"키움 포인트 {points:,}P → 씨앗")
    coins.credit(db, user.id, "BONUS", points, j)
    notify(db, user.id, "PARTNER_POINT", f"키움 포인트 {points:,}P를 씨앗 {points // settings.seed_unit_won:,}개로 바꿨어요", "유료 회차를 볼 때 쓸 수 있어요.", "user", user.id)
    return partner_points(db, user)
