from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import AccountKind, Mode
from app.schemas.common import ORM


class WalletOut(BaseModel):
    mode: Mode
    coin: int = Field(description="콘텐츠용 코인, 원 단위 (예치금으로 환전 불가)")
    seeds: int = Field(default=0, description="화면 표기용 씨앗 개수 = coin ÷ 100 (씨앗 1개 = 100원)")
    deposit_available: int
    deposit_locked: int = Field(description="청약·주문·출금 대기로 묶인 예치금")
    coin_debt: int = Field(default=0, description="인앱 환불로 생긴 씨앗 부족분(원). 다음 충전 때 먼저 상계")


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


class CoinPackageOut(BaseModel):
    id: str
    seeds: int
    bonus_seeds: int
    total_seeds: int
    coin: int = Field(description="지급 코인(원 단위, 보너스 제외)")
    bonus_coin: int
    price: int = Field(description="PG·예치금 결제 금액")
    iap_price: int = Field(description="인앱결제 금액 (스토어 수수료 보전 10% 포함)")


class BuyPackageIn(BaseModel):
    package_id: str = Field(examples=["seed30"])
    channel: str = Field(default="PG", pattern="^(IAP|PG)$", description="IAP = 인앱결제 / PG = 카드·계좌 (모의)")


class CoinLotOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    source: str = Field(description="IAP | PG | CONVERTED | BONUS")
    amount: int
    remaining: int
    paid_amount: int
    expires_at: datetime
    status: str
    package_id: str | None
    parent_lot_id: int | None = Field(default=None, description="묶음 보너스면 함께 산 유료 묶음 id")
    created_at: datetime


class BuyPackageOut(BaseModel):
    package: CoinPackageOut
    channel: str
    paid_amount: int
    lots: list[CoinLotOut]
    wallet: WalletOut
