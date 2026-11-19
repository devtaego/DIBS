from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import AccountKind, Mode
from app.schemas.common import ORM


class WalletOut(BaseModel):
    mode: Mode
    coin: int = Field(description="콘텐츠용 코인 (예치금으로 환전 불가)")
    deposit_available: int
    deposit_locked: int = Field(description="청약·주문·출금 대기로 묶인 예치금")


class AmountIn(BaseModel):
    amount: int = Field(gt=0, examples=[100_000])


class WithdrawalOut(ORM):
    id: int
    user_id: int
    amount: int
    mode: Mode
    status: str
    created_at: datetime
    decided_at: datetime | None


class LedgerLineOut(BaseModel):
    journal_id: int
    kind: str
    account: AccountKind
    amount: int
    mode: Mode
    ref_type: str | None
    ref_id: int | None
    memo: str | None
    created_at: datetime
