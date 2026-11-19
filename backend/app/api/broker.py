"""증권사 연계 API (B안). DIBS가 제안하는 연동 규격이다.

- 앱용: 청약 넘기기(딥링크 + 서명 토큰), 공모 현황(증권사 집계), 공개 설정
- 증권사 서버용 (X-Broker-Signature = HMAC-SHA256(공유 비밀키, 정렬된 JSON 본문 또는 "GET 경로")):
  넘김 토큰 확인, 우선 배정 명단, 분배 지시서, 웹훅 수신 (X-Event-Id 로 중복 방지)
- dev 전용: 모의 키움 서버 (실제 제휴 API 대신 같은 규격으로 동작)
"""
from datetime import datetime

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.errors import Forbidden, NotFound
from app.core.security import current_user
from app.models import DividendRun, User
from app.services import broker
from app.services import funding as funding_svc

router = APIRouter(tags=["broker"])


class HandoffOut(BaseModel):
    channel: str = Field(description="INTERNAL(앱 안 모의 청약) | BROKER(증권사 청약 화면)")
    broker: str
    deeplink: str = Field(description="증권사 앱 청약 화면 딥링크")
    token: str = Field(description="서명된 넘김 토큰 (10분)")
    expires_at: datetime
    linked: bool = Field(description="이미 증권사 계정이 연결돼 있는지")


class TokenIn(BaseModel):
    token: str


class MockSubscribeIn(BaseModel):
    token: str
    units: int = Field(ge=1)
    new_account: bool = Field(default=False, description="키움 계좌를 이번에 처음 열었는지 (계좌 개설 쿠폰 대상)")


def _require_sig(data: bytes, signature: str | None) -> None:
    broker.verify_signature(data, signature)


@router.get("/config/public", summary="공개 설정 (청약 경로·제휴 증권사·모드)")
def public_config():
    return {"subscription_channel": settings.subscription_channel, "broker_name": settings.broker_name,
            "trading_mode": settings.trading_mode, "partner_coupon_coin": settings.partner_coupon_coin,
            "first_time_cap_amount": settings.first_time_cap_amount}


@router.post("/fundings/{funding_id}/broker-handoff", response_model=HandoffOut,
             summary="'키움에서 청약하기': 증권사 청약 화면 딥링크와 서명 토큰 발급")
def handoff(funding_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return broker.issue_handoff(db, user, funding_svc.get_funding(db, funding_id))


@router.get("/fundings/{funding_id}/broker-state", summary="증권사 청약 현황(집계)·배정·보유자 명부·분배 완료 상태")
def broker_state(funding_id: int, db: Session = Depends(get_db)):
    return broker.offering_state(db, funding_svc.get_funding(db, funding_id))


# ── 증권사 서버용 ──

@router.post("/broker/handoff/verify", summary="[증권사 서버] 넘김 토큰 확인 → 공모 정보·회원 가명 id")
def verify(body: TokenIn, db: Session = Depends(get_db), x_broker_signature: str | None = Header(default=None)):
    _require_sig(broker.canonical(body.model_dump()), x_broker_signature)
    return broker.verify_handoff(db, body.token)


@router.get("/broker/fundings/{funding_id}/priority-list", summary="[증권사 서버] 우선 배정 명단 (연결 식별자)")
def priority(funding_id: int, db: Session = Depends(get_db), x_broker_signature: str | None = Header(default=None)):
    _require_sig(f"GET /broker/fundings/{funding_id}/priority-list".encode(), x_broker_signature)
    return broker.priority_list(db, funding_svc.get_funding(db, funding_id))


@router.get("/broker/dividend-runs/{run_id}/instruction", summary="[증권사 서버] 분배 지시서 (연결 식별자별 세전 금액)")
def instruction(run_id: int, db: Session = Depends(get_db), x_broker_signature: str | None = Header(default=None)):
    _require_sig(f"GET /broker/dividend-runs/{run_id}/instruction".encode(), x_broker_signature)
    run = db.get(DividendRun, run_id)
    if run is None:
        raise NotFound("DIVIDEND_NOT_FOUND", "배당 내역을 찾을 수 없어요")
    return broker.dividend_instruction(db, run)


@router.post("/broker/webhooks/{event_type}",
             summary="[증권사 서버] 웹훅: account-linked · account-unlinked · subscription-summary · "
                     "allocation-confirmed · holder-registry · payout-completed")
def webhook(event_type: str, body: dict, db: Session = Depends(get_db),
            x_broker_signature: str | None = Header(default=None), x_event_id: str | None = Header(default=None)):
    _require_sig(broker.canonical(body), x_broker_signature)
    if not x_event_id:
        raise Forbidden("EVENT_ID_REQUIRED", "X-Event-Id 헤더가 필요해요")
    return broker.handle_event(db, event_type, x_event_id, body)


# ── dev 전용: 모의 키움 서버 ──

def _mock_enabled() -> None:
    if not settings.enable_mock_broker or settings.env == "prod":
        raise NotFound("NOT_FOUND", "없는 경로예요")


@router.post("/dev/mock-kiwoom/subscribe", summary="[모의 키움] 청약 화면에서 청약 (처음이면 계정 연결·쿠폰)")
def mock_subscribe(body: MockSubscribeIn, db: Session = Depends(get_db)):
    _mock_enabled()
    from app.services.broker import mock_kiwoom

    return mock_kiwoom.subscribe(db, body.token, body.units, body.new_account)


@router.post("/dev/mock-kiwoom/fundings/{funding_id}/close", summary="[모의 키움] 마감·배정 확정 → 배정 결과 웹훅")
def mock_close(funding_id: int, db: Session = Depends(get_db)):
    _mock_enabled()
    from app.services.broker import mock_kiwoom

    return mock_kiwoom.close(db, funding_svc.get_funding(db, funding_id))


@router.post("/dev/mock-kiwoom/fundings/{funding_id}/registry", summary="[모의 키움] 보유자 명부 웹훅")
def mock_registry(funding_id: int, db: Session = Depends(get_db)):
    _mock_enabled()
    from app.services.broker import mock_kiwoom

    return mock_kiwoom.send_registry(db, funding_svc.get_funding(db, funding_id))


@router.post("/dev/mock-kiwoom/dividend-runs/{run_id}/pay", summary="[모의 키움] 분배 지시서대로 지급 → 완료 웹훅")
def mock_pay(run_id: int, db: Session = Depends(get_db)):
    _mock_enabled()
    from app.services.broker import mock_kiwoom

    return mock_kiwoom.pay(db, run_id)
