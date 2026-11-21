from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.models.enums import Mode
from app.core.security import current_user
from app.models import User, WithdrawalRequest
from app.schemas.wallet import (AmountIn, BuyPackageIn, BuyPackageOut, CoinLotOut, CoinPackageOut, LedgerLineOut,
                                WalletOut, WithdrawalOut)
from app.services import coins
from app.services import wallet as svc

router = APIRouter(prefix="/wallet", tags=["wallet"])


@router.get("", response_model=WalletOut, summary="지갑 잔액 (코인 / 예치금)")
def get_wallet(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return svc.summary(db, user)


@router.post("/coin/charge", response_model=WalletOut, summary="코인 충전 (PG 모의)")
def charge_coin(body: AmountIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    svc.charge_coin(db, user, body.amount)
    return svc.summary(db, user)


@router.get("/coin/packages", response_model=list[CoinPackageOut], summary="씨앗 묶음 목록 (10 · 30 · 55개)")
def coin_packages():
    return coins.packages()


@router.post("/coin/packages/buy", response_model=BuyPackageOut, status_code=201, summary="씨앗 묶음 구매 (IAP·PG 모의)")
def buy_package(body: BuyPackageIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    r = coins.buy_package(db, user, body.package_id, body.channel)
    return {**r, "wallet": svc.summary(db, user)}


@router.get("/coin/lots", response_model=list[CoinLotOut], summary="씨앗 충전 내역 (출처·남은 양·유효기간)")
def coin_lots(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return coins.lots_of(db, user)


@router.post("/coin/lots/{lot_id}/refund", response_model=CoinLotOut, summary="PG 충전분 환불 (7일 안 미사용은 결제 취소, 그 밖에는 남은 씨앗 1,000원 이상 계좌 환불)")
def refund_lot(lot_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return coins.refund_lot(db, user, lot_id)


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
    req = svc.request_withdrawal(db, user, body.amount)
    # 1회 1,000만 원 이하는 즉시 처리, 넘으면 운영자(FIN) 승인 대기 (기획서 3-4-4)
    if req.mode == Mode.MOCK and settings.mock_instant_withdrawal and req.amount <= settings.withdraw_auto_limit:
        req = svc.decide_withdrawal(db, req.id, True)  # 연결 계좌로 즉시 이체
    return req


@router.get("/deposit/withdrawals", response_model=list[WithdrawalOut], summary="내 출금 요청 내역")
def my_withdrawals(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return list(db.scalars(select(WithdrawalRequest).where(WithdrawalRequest.user_id == user.id)
                           .order_by(WithdrawalRequest.id.desc())))


@router.get("/history", response_model=list[LedgerLineOut], summary="입출금·거래 원장 내역")
def history(limit: int = Query(default=50, le=200), offset: int = 0,
            db: Session = Depends(get_db), user: User = Depends(current_user)):
    return svc.history(db, user, limit, offset)
