"""지갑: 콘텐츠용 코인과 투자용 예치금.

- 코인은 MVP 에서도 실결제 → 항상 Mode.LIVE 계정 (PG 연동은 현재 모의)
- 예치금은 trading_mode(MOCK/LIVE)를 따른다
- 예치금 → 코인 전환은 실거래 모드에서만 허용 (모의 예치금으로 실제 코인을 살 수 없음)
- 코인 → 예치금 전환은 어떤 경우에도 불가 (ledger.post 에서도 차단)
"""
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import clock
from app.core.errors import Conflict, DomainError, NotFound
from app.models import Journal, Posting, User, WithdrawalRequest
from app.models.enums import AccountKind, Mode
from app.core.config import settings
from app.services import coins, ledger
from app.services.ledger import Leg
from app.services.policy import current_mode, ensure_mode_allowed

COIN_MODE = Mode.LIVE
MAX_CHARGE = 5_000_000


def _amount(amount: int) -> None:
    if amount <= 0 or amount > MAX_CHARGE:
        raise DomainError("INVALID_AMOUNT", f"1원 이상 {MAX_CHARGE:,}원 이하로 입력해 주세요")


def summary(db: Session, user: User) -> dict:
    mode = current_mode()
    acc = ledger.user_accounts(db, user.id, mode)
    coin = ledger.get_account(db, AccountKind.COIN, COIN_MODE, user.id)
    coin_bal = ledger.balance(db, coin)
    return {
        "mode": mode,
        "coin": coin_bal,
        "seeds": coin_bal // settings.seed_unit_won,  # 화면 표기: 씨앗 1개 = 100원
        "deposit_available": ledger.balance(db, acc.deposit),
        "deposit_locked": ledger.balance(db, acc.locked),
        "coin_debt": user.coin_debt or 0,
    }


def charge_coin(db: Session, user: User, amount: int) -> Journal:
    _amount(amount)
    coin = ledger.get_account(db, AccountKind.COIN, COIN_MODE, user.id)
    j = ledger.post(db, "COIN_CHARGE", [Leg(ledger.sys(db, AccountKind.SYS_PG, COIN_MODE), -amount), Leg(coin, amount)],
                    COIN_MODE, "user", user.id, memo="코인 충전")
    coins.credit(db, user.id, "PG", amount, j, paid_amount=amount)
    return j


def charge_deposit(db: Session, user: User, amount: int) -> Journal:
    _amount(amount)
    mode = current_mode()
    ensure_mode_allowed(mode)
    acc = ledger.user_accounts(db, user.id, mode)
    return ledger.post(db, "DEPOSIT_IN", [Leg(ledger.sys(db, AccountKind.SYS_BANK, mode), -amount), Leg(acc.deposit, amount)],
                       mode, "user", user.id, memo="예치금 입금" if mode == Mode.MOCK else "증권사 예탁금 입금")


def deposit_to_coin(db: Session, user: User, amount: int) -> Journal:
    _amount(amount)
    if current_mode() != Mode.LIVE:
        raise Conflict("MOCK_DEPOSIT_TO_COIN", "모의 예치금은 코인으로 바꿀 수 없어요")
    acc = ledger.user_accounts(db, user.id, Mode.LIVE)
    j = ledger.post(db, "DEPOSIT_TO_COIN", [Leg(acc.deposit, -amount), Leg(acc.coin, amount)], Mode.LIVE, "user", user.id)
    coins.credit(db, user.id, "CONVERTED", amount, j, paid_amount=amount)
    return j


def request_withdrawal(db: Session, user: User, amount: int) -> WithdrawalRequest:
    if amount < settings.withdraw_min:
        raise DomainError("WITHDRAW_MIN", f"{settings.withdraw_min:,}원 이상부터 출금할 수 있어요")
    if user.account_changed_at and clock.now() < user.account_changed_at + timedelta(hours=settings.account_change_hold_hours):
        raise Conflict("ACCOUNT_CHANGE_HOLD", f"계좌를 바꾼 뒤 {settings.account_change_hold_hours}시간 동안은 출금할 수 없어요")
    mode = current_mode()
    acc = ledger.user_accounts(db, user.id, mode)
    req = WithdrawalRequest(user_id=user.id, amount=amount, mode=mode)
    db.add(req)
    db.flush()
    ledger.post(db, "WITHDRAWAL_LOCK", [Leg(acc.deposit, -amount), Leg(acc.locked, amount)], mode, "withdrawal", req.id)
    return req


def decide_withdrawal(db: Session, req_id: int, approve: bool) -> WithdrawalRequest:
    req = db.get(WithdrawalRequest, req_id)
    if req is None:
        raise NotFound("WITHDRAWAL_NOT_FOUND", "출금 요청을 찾을 수 없어요")
    if req.status != "PENDING":
        raise Conflict("WITHDRAWAL_DECIDED", "이미 처리된 요청이에요")
    acc = ledger.user_accounts(db, req.user_id, req.mode)
    other = ledger.sys(db, AccountKind.SYS_BANK, req.mode) if approve else acc.deposit
    ledger.post(db, "WITHDRAWAL_OUT" if approve else "WITHDRAWAL_CANCEL",
                [Leg(acc.locked, -req.amount), Leg(other, req.amount)], req.mode, "withdrawal", req.id)
    req.status, req.decided_at = ("APPROVED" if approve else "REJECTED"), clock.now()
    return req


def history(db: Session, user: User, limit: int = 50, offset: int = 0) -> list[dict]:
    rows = db.execute(
        select(Journal, Posting.amount, ledger.Account.kind)
        .join(Posting, Posting.journal_id == Journal.id)
        .join(ledger.Account, ledger.Account.id == Posting.account_id)
        .where(ledger.Account.owner_id == user.id)
        .order_by(Journal.created_at.desc(), Journal.id.desc())
        .limit(limit).offset(offset)
    ).all()
    return [{"journal_id": j.id, "kind": j.kind, "account": k, "amount": amt, "mode": j.mode,
             "ref_type": j.ref_type, "ref_id": j.ref_id, "memo": j.memo, "created_at": j.created_at}
            for j, amt, k in rows]
