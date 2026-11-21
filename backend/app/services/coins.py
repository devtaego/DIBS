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
SOURCES = ("BONUS", "CONVERTED", "PG", "IAP")  # 차감 순서


def seeds(won: int) -> float:
    """원 → 씨앗 개수 (화면 표기용)."""
    return won / settings.seed_unit_won


def _expiry(source: str):
    days = settings.bonus_coin_expiry_days if source == "BONUS" else settings.paid_coin_expiry_days
    return clock.now() + timedelta(days=days)


def credit(db: Session, user_id: int, source: str, amount: int, journal: Journal | None,
           paid_amount: int = 0, package_id: str | None = None) -> CoinLot:
    lot = CoinLot(user_id=user_id, source=source, amount=amount, remaining=amount, paid_amount=paid_amount,
                  expires_at=_expiry(source), package_id=package_id, journal_id=journal.id if journal else None)
    db.add(lot)
    db.flush()
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
    """씨앗 묶음 구매 (결제는 모의). IAP는 스토어 수수료 보전분(10%)을 더한 값을 결제한다."""
    pkg = next((p for p in packages() if p["id"] == package_id), None)
    if pkg is None:
        raise NotFound("PACKAGE_NOT_FOUND", "씨앗 묶음을 찾을 수 없어요")
    if channel not in ("IAP", "PG"):
        raise DomainError("BAD_CHANNEL", "결제 수단은 IAP 또는 PG예요")
    coin = ledger.get_account(db, AccountKind.COIN, COIN_MODE, user.id)
    paid = pkg["iap_price"] if channel == "IAP" else pkg["price"]
    j = ledger.post(db, "COIN_CHARGE", [Leg(ledger.sys(db, AccountKind.SYS_PG, COIN_MODE), -pkg["coin"]), Leg(coin, pkg["coin"])],
                    COIN_MODE, "user", user.id, memo=f"씨앗 {pkg['seeds']}개 ({channel})")
    lots = [credit(db, user.id, channel, pkg["coin"], j, paid_amount=paid, package_id=package_id)]
    if pkg["bonus_coin"]:
        jb = ledger.post(db, "COIN_BONUS", [Leg(ledger.sys(db, AccountKind.SYS_PROMOTION, COIN_MODE), -pkg["bonus_coin"]),
                                            Leg(coin, pkg["bonus_coin"])], COIN_MODE, "user", user.id,
                         memo=f"묶음 보너스 씨앗 {pkg['bonus_seeds']}개")
        lots.append(credit(db, user.id, "BONUS", pkg["bonus_coin"], jb, package_id=package_id))
    return {"package": pkg, "channel": channel, "paid_amount": paid, "lots": lots}


def refund_lot(db: Session, user: User, lot_id: int) -> CoinLot:
    """PG 충전분 결제 취소: 결제 후 7일 안이고 한 번도 쓰지 않았을 때만."""
    lot = db.get(CoinLot, lot_id)
    if lot is None or lot.user_id != user.id:
        raise NotFound("COIN_LOT_NOT_FOUND", "충전 내역을 찾을 수 없어요")
    if lot.source != "PG":
        raise Conflict("NOT_REFUNDABLE", "카드·계좌 결제(PG)로 충전한 씨앗만 여기서 취소할 수 있어요")
    if lot.status != "ACTIVE" or lot.remaining != lot.amount:
        raise Conflict("NOT_REFUNDABLE", "이미 쓴 씨앗이 있어 결제 취소할 수 없어요")
    if clock.now() > lot.created_at + timedelta(days=settings.pg_refund_days):
        raise Conflict("NOT_REFUNDABLE", f"결제 후 {settings.pg_refund_days}일이 지나 취소할 수 없어요")
    coin = ledger.get_account(db, AccountKind.COIN, COIN_MODE, user.id)
    ledger.post(db, "COIN_REFUND", [Leg(coin, -lot.amount), Leg(ledger.sys(db, AccountKind.SYS_PG, COIN_MODE), lot.amount)],
                COIN_MODE, "coin_lot", lot.id, memo="씨앗 결제 취소")
    lot.remaining, lot.status = 0, "REFUNDED"
    return lot


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
