"""씨앗(코인) 출처별 묶음 관리 (기획서 3-4-3, v2.2 조정값).

- 원장의 COIN 계정 잔액이 기준이고, 묶음(CoinLot)은 출처·유효기간·환불 판단용 보조 장부다.
- 화면 표기: 씨앗 1개 = 100원 (settings.seed_unit_won). 장부는 원 단위 정수.
- 차감 순서: BONUS → CONVERTED → PG → IAP, 같은 출처 안에서는 만료가 빠른 것부터.
  (기획서는 미리보기에 IAP·BONUS만 쓰게 했지만, 화면은 예치금으로 산 씨앗으로 회차를 연다.
   국내 앱은 외부 결제를 쓸 수 있어 모든 출처를 허용하고, 순매출에서 결제 수수료(inapp_fee_bps)를 똑같이 뺀다)
- 보너스 씨앗은 90일, 유료 충전분은 5년 뒤 만료. PG 충전분은 7일 안에 한 번도 안 썼으면 결제 취소할 수 있다.
"""
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import clock
from app.core.config import settings
from app.core.errors import Conflict, DomainError, NotFound
from app.models import CoinLot, Journal, User
from app.models.enums import AccountKind, Mode
from app.services import ledger
from app.services.ledger import Leg

COIN_MODE = Mode.LIVE
SOURCES = ("BONUS", "CONVERTED", "DEPOSIT", "PG", "IAP")  # 차감 순서 (DEPOSIT = 키움 예치금으로 결제한 묶음)


def seeds(won: int) -> float:
    """원 → 씨앗 개수 (화면 표기용)."""
    return won / settings.seed_unit_won


def _expiry(source: str):
    days = settings.bonus_coin_expiry_days if source == "BONUS" else settings.paid_coin_expiry_days
    return clock.now() + timedelta(days=days)


def credit(db: Session, user_id: int, source: str, amount: int, journal: Journal | None,
           paid_amount: int = 0, package_id: str | None = None, parent_lot_id: int | None = None) -> CoinLot:
    lot = CoinLot(user_id=user_id, source=source, amount=amount, remaining=amount, paid_amount=paid_amount,
                  expires_at=_expiry(source), package_id=package_id, journal_id=journal.id if journal else None,
                  parent_lot_id=parent_lot_id)
    db.add(lot)
    db.flush()
    user = db.get(User, user_id)
    if user is not None and (user.coin_debt or 0) > 0:  # 인앱 환불 부족분을 새로 들어온 씨앗에서 먼저 상계
        off = min(user.coin_debt, amount)
        coin = ledger.get_account(db, AccountKind.COIN, COIN_MODE, user_id)
        ledger.post(db, "COIN_DEBT_OFFSET", [Leg(coin, -off), Leg(ledger.sys(db, AccountKind.SYS_PG, COIN_MODE), off)],
                    COIN_MODE, "user", user_id, memo="인앱 환불 부족분 상계")
        lot.remaining -= off
        user.coin_debt -= off
        if lot.remaining == 0:
            lot.status = "USED"
    return lot


def consume(db: Session, user_id: int, amount: int) -> None:
    """씨앗을 쓴 만큼 묶음에서 뺀다. 묶음이 없는 예전 잔액은 원장만으로 처리한다."""
    lots = list(db.scalars(select(CoinLot).where(CoinLot.user_id == user_id, CoinLot.status == "ACTIVE",
                                                 CoinLot.remaining > 0)))
    lots.sort(key=lambda l: (SOURCES.index(l.source) if l.source in SOURCES else 9, l.expires_at, l.id))
    left = amount
    for lot in lots:
        if left == 0:
            break
        q = min(left, lot.remaining)
        lot.remaining -= q
        left -= q
        if lot.remaining == 0:
            lot.status = "USED"


def packages() -> list[dict]:
    out = []
    for p in settings.coin_packages:
        coin = p["seeds"] * settings.seed_unit_won
        out.append({**p, "coin": coin, "bonus_coin": p["bonus_seeds"] * settings.seed_unit_won,
                    "total_seeds": p["seeds"] + p["bonus_seeds"],
                    "iap_price": p["price"] * (10000 + settings.iap_markup_bps) // 10000})
    return out


def buy_package(db: Session, user: User, package_id: str, channel: str) -> dict:
    """씨앗 묶음 구매. IAP는 스토어 수수료 보전분(10%)을 더한 값을 결제한다.
    DEPOSIT = 키움 예치금에서 결제: 예치금에서 결제 금액만큼 빠져나가고(증권사 계좌에서 출금해 결제한 것으로 기록),
    씨앗은 PG 결제와 같은 방식으로 들어온다. 예치금이 모자라면 서버가 거절한다."""
    pkg = next((p for p in packages() if p["id"] == package_id), None)
    if pkg is None:
        raise NotFound("PACKAGE_NOT_FOUND", "씨앗 묶음을 찾을 수 없어요")
    if channel not in ("IAP", "PG", "DEPOSIT"):
        raise DomainError("BAD_CHANNEL", "결제 수단은 IAP, PG, DEPOSIT 중 하나예요")
    coin = ledger.get_account(db, AccountKind.COIN, COIN_MODE, user.id)
    paid = pkg["iap_price"] if channel == "IAP" else pkg["price"]
    if channel == "DEPOSIT":
        from app.services.policy import current_mode
        mode = current_mode()
        dep = ledger.user_accounts(db, user.id, mode).deposit
        ledger.post(db, "SEED_PAY_DEPOSIT", [Leg(dep, -paid), Leg(ledger.sys(db, AccountKind.SYS_BANK, mode), paid)],
                    mode, "user", user.id, memo=f"씨앗 {pkg['seeds']}개 결제 (키움 예치금)")
    j = ledger.post(db, "COIN_CHARGE", [Leg(ledger.sys(db, AccountKind.SYS_PG, COIN_MODE), -pkg["coin"]), Leg(coin, pkg["coin"])],
                    COIN_MODE, "user", user.id, memo=f"씨앗 {pkg['seeds']}개 ({channel})")
    lots = [credit(db, user.id, channel, pkg["coin"], j, paid_amount=paid, package_id=package_id)]
    if pkg["bonus_coin"]:
        jb = ledger.post(db, "COIN_BONUS", [Leg(ledger.sys(db, AccountKind.SYS_PROMOTION, COIN_MODE), -pkg["bonus_coin"]),
                                            Leg(coin, pkg["bonus_coin"])], COIN_MODE, "user", user.id,
                         memo=f"묶음 보너스 씨앗 {pkg['bonus_seeds']}개")
        lots.append(credit(db, user.id, "BONUS", pkg["bonus_coin"], jb, package_id=package_id, parent_lot_id=lots[0].id))
    return {"package": pkg, "channel": channel, "paid_amount": paid, "lots": lots}


def _revoke_bonus_children(db: Session, lot: CoinLot) -> int:
    """환불한 유료 묶음과 함께 받은 묶음 보너스 중 남은 양을 회수한다."""
    coin = ledger.get_account(db, AccountKind.COIN, COIN_MODE, lot.user_id)
    total = 0
    for b in db.scalars(select(CoinLot).where(CoinLot.parent_lot_id == lot.id, CoinLot.status == "ACTIVE")):
        amt = min(b.remaining, ledger.balance(db, coin))
        if amt > 0:
            ledger.post(db, "COIN_BONUS_REVOKE", [Leg(coin, -amt), Leg(ledger.sys(db, AccountKind.SYS_PROMOTION, COIN_MODE), amt)],
                        COIN_MODE, "coin_lot", b.id, memo="환불한 묶음의 보너스 씨앗 회수")
            total += amt
        b.remaining, b.status = 0, "REFUNDED"
    return total


def _bonus_untouched(db: Session, lot: CoinLot) -> bool:
    return all(b.remaining == b.amount for b in db.scalars(select(CoinLot).where(CoinLot.parent_lot_id == lot.id)))


def refund_lot(db: Session, user: User, lot_id: int) -> CoinLot:
    """PG 충전분 환불 (기획서 3-4-5).

    - 결제 후 7일 안이고 한 번도 안 썼으면(묶음 보너스 포함) 결제 취소: 결제 금액 전액
    - 그 밖에는 남은 씨앗만큼 본인 계좌로 환불(수수료 없음). 남은 금액이 1,000원 미만이면 환불 불가
    - 어느 쪽이든 함께 받은 묶음 보너스의 남은 양은 회수한다
    """
    lot = db.get(CoinLot, lot_id)
    if lot is None or lot.user_id != user.id:
        raise NotFound("COIN_LOT_NOT_FOUND", "충전 내역을 찾을 수 없어요")
    if lot.source not in ("PG", "DEPOSIT"):
        raise Conflict("NOT_REFUNDABLE", "카드·계좌나 키움 예치금으로 결제한 씨앗만 환불할 수 있어요. 인앱결제는 스토어에서 환불해요")
    if lot.status != "ACTIVE" or lot.remaining <= 0:
        raise Conflict("NOT_REFUNDABLE", "환불할 씨앗이 남아 있지 않아요")
    coin = ledger.get_account(db, AccountKind.COIN, COIN_MODE, user.id)
    full_cancel = (lot.remaining == lot.amount and _bonus_untouched(db, lot)
                   and clock.now() <= lot.created_at + timedelta(days=settings.pg_refund_days))
    if not full_cancel and lot.remaining < settings.coin_refund_min:
        raise Conflict("REFUND_TOO_SMALL", f"남은 금액이 {settings.coin_refund_min:,}원 미만이라 환불할 수 없어요")
    amt = min(lot.remaining, ledger.balance(db, coin))
    _revoke_bonus_children(db, lot)
    ledger.post(db, "COIN_REFUND" if full_cancel else "COIN_REFUND_REMAINING",
                [Leg(coin, -amt), Leg(ledger.sys(db, AccountKind.SYS_PG, COIN_MODE), amt)],
                COIN_MODE, "coin_lot", lot.id, memo="씨앗 결제 취소" if full_cancel else "남은 씨앗 계좌 환불")
    if lot.source == "DEPOSIT":  # 예치금으로 결제한 묶음은 키움 예치금으로 돌려준다
        from app.services.policy import current_mode
        mode = current_mode()
        back = lot.paid_amount if full_cancel else amt
        ledger.post(db, "SEED_REFUND_DEPOSIT", [Leg(ledger.sys(db, AccountKind.SYS_BANK, mode), -back),
                                                Leg(ledger.user_accounts(db, user.id, mode).deposit, back)],
                    mode, "coin_lot", lot.id, memo="씨앗 환불 → 키움 예치금")
    lot.remaining, lot.status = 0, "REFUNDED"
    return lot


def iap_refund(db: Session, lot_id: int) -> dict:
    """스토어 환불 알림(App Store Server Notification · Google RTDN) 처리. 묶음 전체를 회수한다.
    이미 써서 잔액이 모자라면 부족분을 user.coin_debt 로 두고 다음 충전 때 상계한다."""
    lot = db.get(CoinLot, lot_id)
    if lot is None:
        raise NotFound("COIN_LOT_NOT_FOUND", "충전 내역을 찾을 수 없어요")
    if lot.source != "IAP":
        raise Conflict("NOT_IAP", "인앱결제 묶음만 스토어 환불 처리할 수 있어요")
    if lot.status == "REFUNDED":
        raise Conflict("ALREADY_REFUNDED", "이미 환불 처리한 묶음이에요")
    user = db.get(User, lot.user_id)
    coin = ledger.get_account(db, AccountKind.COIN, COIN_MODE, user.id)
    _revoke_bonus_children(db, lot)
    own = lot.remaining
    lot.remaining, lot.status = 0, "REFUNDED"
    used = lot.amount - own
    other = min(used, max(0, ledger.balance(db, coin) - own))
    consume(db, user.id, other)
    take = own + other
    if take:
        ledger.post(db, "COIN_IAP_REFUND", [Leg(coin, -take), Leg(ledger.sys(db, AccountKind.SYS_PG, COIN_MODE), take)],
                    COIN_MODE, "coin_lot", lot.id, memo="인앱 환불 회수")
    debt = used - other
    user.coin_debt = (user.coin_debt or 0) + debt
    return {"lot_id": lot.id, "reclaimed": take, "debt_added": debt, "coin_debt": user.coin_debt}


def expire_bonus(db: Session) -> dict:
    """유효기간이 지난 묶음을 만료 처리한다 (운영자 배치)."""
    now = clock.now()
    lots = list(db.scalars(select(CoinLot).where(CoinLot.status == "ACTIVE", CoinLot.remaining > 0,
                                                 CoinLot.expires_at <= now)))
    total = 0
    for lot in lots:
        coin = ledger.get_account(db, AccountKind.COIN, COIN_MODE, lot.user_id)
        amt = min(lot.remaining, ledger.balance(db, coin))
        if amt > 0:
            ledger.post(db, "COIN_EXPIRE", [Leg(coin, -amt), Leg(ledger.sys(db, AccountKind.SYS_COIN_EXPIRED, COIN_MODE), amt)],
                        COIN_MODE, "coin_lot", lot.id, memo="씨앗 유효기간 만료")
            total += amt
        lot.remaining, lot.status = 0, "EXPIRED"
    return {"expired_lots": len(lots), "expired_coin": total}


def lots_of(db: Session, user: User) -> list[CoinLot]:
    return list(db.scalars(select(CoinLot).where(CoinLot.user_id == user.id).order_by(CoinLot.id.desc())))


def usable_breakdown(db: Session, user: User) -> dict:
    out = {s: 0 for s in SOURCES}
    for lot in db.scalars(select(CoinLot).where(CoinLot.user_id == user.id, CoinLot.status == "ACTIVE")):
        out[lot.source] = out.get(lot.source, 0) + lot.remaining
    return out
