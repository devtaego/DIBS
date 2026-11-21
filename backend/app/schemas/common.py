from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import InvestorType, Mode, Role


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ErrorBody(BaseModel):
    code: str = Field(examples=["INSUFFICIENT_BALANCE"])
    message: str = Field(examples=["예치금이 부족해요"])


class ErrorResponse(BaseModel):
    error: ErrorBody


class OK(BaseModel):
    ok: bool = True


# ── auth ──
class DevLoginIn(BaseModel):
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", examples=["reader@dibs.dev"])
    nickname: str | None = None
    role: Role = Role.READER
    investor_type: InvestorType = InvestorType.GENERAL


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int


class UserOut(ORM):
    id: int
    email: str
    nickname: str
    role: Role
    investor_type: InvestorType
    kyc_verified: bool
    bio: str
    avatar_url: str | None
    risk_level: str | None = Field(description="투자성향 5단계: STABLE 안정형 | STABLE_SEEKING 안정추구형 | NEUTRAL 위험중립형 | ACTIVE 적극투자형 | AGGRESSIVE 공격투자형. 없으면 청약·매수 불가")
    risk_checked_at: datetime | None
    broker_name: str | None = Field(description="연결된 제휴 증권사")
    broker_account_masked: str | None
    level: str = Field(default="L1", description="회원 단계: L1 가입 / L2 본인인증 / L3 투자 가능 (만 19세 + 투자성향 + 계좌 연결)")
    birth_date: date | None = None
    account_changed_at: datetime | None = None
    created_at: datetime


class ProfilePatch(BaseModel):
    nickname: str | None = Field(default=None, min_length=1, max_length=50)
    bio: str | None = Field(default=None, max_length=500)
    avatar_url: str | None = None


class RiskProfileIn(BaseModel):
    """투자성향 질문 5개, 각 1(보수)~4(공격) 점."""

    answers: list[int] = Field(min_length=5, max_length=5, examples=[[2, 3, 2, 3, 2]])


class BrokerAccountIn(BaseModel):
    broker_name: str = Field(examples=["제휴증권"])
    account_no: str = Field(pattern=r"^[0-9-]{8,20}$", description="저장 시 끝 4자리만 남기고 가림")


class NotificationOut(ORM):
    id: int
    type: str
    title: str
    body: str
    ref_type: str | None
    ref_id: int | None
    is_read: bool
    created_at: datetime


class LimitsOut(BaseModel):
    mode: Mode
    annual_limit: int
    annual_remaining: int
    security_limit: int | None = None
    security_remaining: int | None = None


__all__ = ["ORM", "date", "datetime"]
