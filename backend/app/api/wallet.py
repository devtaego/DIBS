from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import current_user
from app.models import User, WithdrawalRequest
from app.schemas.wallet import AmountIn, LedgerLineOut, WalletOut, WithdrawalOut
from app.services import wallet as svc

router = APIRouter(prefix="/wallet", tags=["wallet"])


@router.get("", response_model=WalletOut, summary="지갑 잔액 (코인 / 예치금)")
def get_wallet(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return svc.summary(db, user)


@router.post("/coin/charge", response_model=WalletOut, summary="코인 충전 (PG 모의)")
def charge_coin(body: AmountIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    svc.charge_coin(db, user, body.amount)
    return svc.summary(db, user)


@router.post("/deposit/charge", response_model=WalletOut, summary="예치금 입금 (모의 모드: 모의 예치금 지급)")
def charge_deposit(body: AmountIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    svc.charge_deposit(db, user, body.amount)
    return svc.summary(db, user)


@router.post("/deposit/to-coin", response_model=WalletOut, summary="예치금 → 코인 전환 (실거래 모드만)")
def deposit_to_coin(body: AmountIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    svc.deposit_to_coin(db, user, body.amount)
    return svc.summary(db, user)


@router.post("/deposit/withdrawals", response_model=WithdrawalOut, status_code=201, summary="예치금 출금 요청 (운영자 승인)")
def withdraw(body: AmountIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return svc.request_withdrawal(db, user, body.amount)


@router.get("/deposit/withdrawals", response_model=list[WithdrawalOut], summary="내 출금 요청 내역")
def my_withdrawals(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return list(db.scalars(select(WithdrawalRequest).where(WithdrawalRequest.user_id == user.id)
                           .order_by(WithdrawalRequest.id.desc())))


@router.get("/history", response_model=list[LedgerLineOut], summary="입출금·거래 원장 내역")
def history(limit: int = Query(default=50, le=200), offset: int = 0,
            db: Session = Depends(get_db), user: User = Depends(current_user)):
    return svc.history(db, user, limit, offset)
