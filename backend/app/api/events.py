from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import DomainError
from app.core.security import optional_user
from app.models import ContentEvent, User
from app.schemas.content import EventBatchIn, EventBatchOut

router = APIRouter(tags=["events"])


@router.post("/events", response_model=EventBatchOut, status_code=202, summary="이용 이벤트 배치 수집")
def ingest(body: EventBatchIn, db: Session = Depends(get_db), user: User | None = Depends(optional_user)):
    """앱이 최대 100건씩 모아 보낸다. 로그인 상태면 user_id, 아니면 anon_id 필수.

    이벤트 스키마는 데이터 분석 팀과 공유하는 계약이다 (docs/EVENTS.md).
    """
    for e in body.events:
        if user is None and not e.anon_id:
            raise DomainError("ANON_ID_REQUIRED", "비로그인 이벤트에는 anon_id 가 필요해요", 422)
        db.add(ContentEvent(user_id=user.id if user else None, **e.model_dump()))
    return EventBatchOut(accepted=len(body.events))
