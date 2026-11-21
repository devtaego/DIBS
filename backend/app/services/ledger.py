"""원장 서비스. 돈이 움직이는 모든 코드는 반드시 post() 를 거친다."""
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import DomainError, InsufficientBalance
from app.models import Account, Journal, Posting
from app.models.enums import USER_ACCOUNT_KINDS, AccountKind, Mode


def get_account(db: Session, kind: AccountKind, mode: Mode, owner_id: int | None = None) -> Account:
    if kind in USER_ACCOUNT_KINDS and owner_id is None:
        raise ValueError("회원 계정에는 owner_id 가 필요합니다")
    if kind not in USER_ACCOUNT_KINDS:
        owner_id = None
    owner_cond = Account.owner_id.is_(None) if owner_id is None else Account.owner_id == owner_id
    acc = db.scalar(select(Account).where(Account.kind == kind, Account.mode == mode, owner_cond))
    if acc is None:
        acc = Account(kind=kind, mode=mode, owner_id=owner_id)
        db.add(acc)
        db.flush()
    return acc


def balance(db: Session, account: Account) -> int:
    return int(db.scalar(select(func.coalesce(func.sum(Posting.amount), 0)).where(Posting.account_id == account.id)))


@dataclass
class Leg:
    account: Account
    amount: int  # +입금 / -출금


def post(
    db: Session,
    kind: str,
    legs: list[Leg],
    mode: Mode,
    ref_type: str | None = None,
    ref_id: int | None = None,
    memo: str | None = None,
) -> Journal:
    legs = [leg for leg in legs if leg.amount != 0]
    if not legs:
        raise DomainError("EMPTY_JOURNAL", "금액이 0인 분개는 기록하지 않아요")
    if sum(leg.amount for leg in legs) != 0:
        raise ValueError(f"분개 합계가 0이 아닙니다: {[(l.account.kind, l.amount) for l in legs]}")
    if any(leg.account.mode != mode for leg in legs):
        raise ValueError("모의/실거래 계정을 한 분개에 섞을 수 없습니다")
    # 코인 → 예치금 이동 금지 (콘텐츠 결제와 투자금 분리 원칙)
    coin_out = any(l.account.kind == AccountKind.COIN and l.amount < 0 for l in legs)
    deposit_in = any(l.account.kind in (AccountKind.DEPOSIT, AccountKind.DEPOSIT_LOCKED) and l.amount > 0 for l in legs)
    if coin_out and deposit_in:
        raise DomainError("COIN_TO_DEPOSIT_FORBIDDEN", "씨앗은 예치금으로 바꿀 수 없어요")

    journal = Journal(kind=kind, mode=mode, ref_type=ref_type, ref_id=ref_id, memo=memo)
    db.add(journal)
    db.flush()
    for leg in legs:
        db.add(Posting(journal_id=journal.id, account_id=leg.account.id, amount=leg.amount))
    db.flush()

    # 회원 계정 음수 방지 (운영 DB 에서는 SELECT ... FOR UPDATE 로 계정 행 잠금 필요)
    for leg in legs:
        if leg.account.kind in USER_ACCOUNT_KINDS and leg.amount < 0 and balance(db, leg.account) < 0:
            raise InsufficientBalance(
                "씨앗이 부족해요" if leg.account.kind == AccountKind.COIN else "예치금이 부족해요"
            )
    return journal


@dataclass
class UserAccounts:
    coin: Account
    deposit: Account
    locked: Account


def user_accounts(db: Session, user_id: int, mode: Mode) -> UserAccounts:
    return UserAccounts(
        coin=get_account(db, AccountKind.COIN, mode, user_id),
        deposit=get_account(db, AccountKind.DEPOSIT, mode, user_id),
        locked=get_account(db, AccountKind.DEPOSIT_LOCKED, mode, user_id),
    )


def sys(db: Session, kind: AccountKind, mode: Mode) -> Account:
    return get_account(db, kind, mode)
