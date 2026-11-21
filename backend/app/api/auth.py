from datetime import date

from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.errors import Forbidden
from app.core.security import create_token, current_user
from app.models import User
from app.schemas.common import DevLoginIn, TokenOut, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/dev-login", response_model=TokenOut, summary="개발용 로그인 (없으면 가입)")
def dev_login(body: DevLoginIn, db: Session = Depends(get_db)):
    """개발·시연용. 실서비스는 휴대폰/간편인증 기반 본인확인으로 교체한다."""
    if settings.env == "prod":
        raise Forbidden("DEV_LOGIN_DISABLED", "운영 환경에서는 사용할 수 없어요")
    user = db.scalar(select(User).where(User.email == body.email))
    if user is None:
        user = User(email=body.email, nickname=body.nickname or body.email.split("@")[0],
                    role=body.role, investor_type=body.investor_type)
        db.add(user)
        db.flush()
    return TokenOut(access_token=create_token(user), user_id=user.id)


class MockKycIn(BaseModel):
    birth_date: date | None = Field(default=None, description="모의 본인인증 생년월일 (비우면 성인 1995-01-01)")


@router.post("/kyc/mock", response_model=UserOut, summary="모의 본인인증 완료 처리")
def mock_kyc(body: MockKycIn | None = None, user: User = Depends(current_user)):
    """주민등록번호 등 식별정보는 저장하지 않고, 실서비스에서는 본인확인기관 결과(CI·생년월일)만 받는다."""
    user.kyc_verified = True
    user.birth_date = (body.birth_date if body and body.birth_date else None) or user.birth_date or date(1995, 1, 1)
    return user
