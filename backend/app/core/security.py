"""개발용 인증. 실서비스에서는 본인확인기관(PASS·카카오·토스 인증) + OAuth 로 교체한다."""
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import Depends, Header
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.errors import DomainError, Forbidden
from app.models import User
from app.models.enums import Role


def create_token(user: User) -> str:
    exp = datetime.now(UTC) + timedelta(minutes=settings.jwt_exp_minutes)  # 토큰 만료는 실제 시각(UTC) 기준
    payload = {"sub": str(user.id), "role": str(user.role), "exp": exp}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_alg)


def _decode(token: str) -> int:
    try:
        data = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_alg])
        return int(data["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise DomainError("INVALID_TOKEN", "로그인이 필요해요", 401) from None


def optional_user(authorization: str | None = Header(default=None), db: Session = Depends(get_db)) -> User | None:
    if not authorization:
        return None
    if not authorization.startswith("Bearer "):
        raise DomainError("INVALID_TOKEN", "로그인이 필요해요", 401)
    return db.get(User, _decode(authorization.removeprefix("Bearer ")))


def current_user(user: User | None = Depends(optional_user)) -> User:
    if user is None:
        raise DomainError("UNAUTHORIZED", "로그인이 필요해요", 401)
    return user


def require_role(*roles: Role):
    def dep(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise Forbidden("FORBIDDEN_ROLE", "권한이 없어요")
        return user

    return dep


creator_only = require_role(Role.CREATOR, Role.ADMIN)
admin_only = require_role(Role.ADMIN)
