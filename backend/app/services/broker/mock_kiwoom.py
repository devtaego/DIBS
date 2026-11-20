"""모의 키움 서버 (dev 전용).

실제 키움 제휴 API가 없으므로, DIBS가 제안한 연동 규격대로 증권사 쪽 동작을 흉내 낸다.
- 청약 접수·배정·분배 지급은 DIBS 백엔드의 모의 청약 엔진이 '증권사 시스템' 역할을 한다
  (DIBS 모의 예치금 = 키움 예치금(모의)).
- 증권사가 DIBS에 보내는 것은 모두 서명된 웹훅(broker.handle_event)으로 보낸다.
계약 후에는 이 모듈 대신 실제 증권사가 같은 규격으로 웹훅을 보낸다.
"""
import secrets

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import Forbidden
from app.models import DividendRun, Funding, Subscription, User
from app.models.enums import SubscriptionStatus
from app.services import broker, dividend
from app.services import funding as funding_svc

CONSENTS = {"investment-risk": "2026-11-19", "termination-rule": "2026-11-19", "channel": "KIWOOM_MOCK"}


def _send(db: Session, event_type: str, payload: dict) -> dict:
    # 실제로는 HTTPS POST /broker/webhooks/{event} + X-Broker-Signature. 모의 서버는 같은 처리기를 바로 부른다
    broker.verify_signature(broker.canonical(payload), broker.sign(broker.canonical(payload)))
    return broker.handle_event(db, event_type, f"mock-{event_type}-{secrets.token_hex(6)}", payload)


def subscribe(db: Session, token: str, units: int, new_account: bool = False) -> dict:
    """키움 청약 화면에서 청약: 토큰 확인 → (처음이면) 계좌 연결 → 청약 접수 → 청약 현황(집계) 전송."""
    d = broker.decode_handoff(token)
    user, f = db.get(User, d["uid"]), db.get(Funding, d["fid"])
    if not user.risk_checked_at:
        raise Forbidden("RISK_PROFILE_REQUIRED", "키움 투자성향 확인 후 청약할 수 있어요")
    linked = None
    if broker._link(db, user.id) is None:
        linked = _send(db, "account-linked", {"handoff_token": token, "link_ref": f"kw_{secrets.token_hex(8)}",
                                              "new_account": new_account})
    cur = db.scalar(select(Subscription).where(Subscription.funding_id == f.id, Subscription.user_id == user.id,
                                               Subscription.status == SubscriptionStatus.ACTIVE))
    # 이미 청약했으면 키움 화면의 수량으로 바꾼다 (DIBS ↔ 키움 어느 쪽에서 해도 같은 청약 1건)
    sub = funding_svc.change_subscription(db, user, f, units) if cur else funding_svc.subscribe(db, user, f, units, None, None, CONSENTS)
    subs = list(db.scalars(select(Subscription).where(Subscription.funding_id == f.id,
                                                      Subscription.status == SubscriptionStatus.ACTIVE)))
    _send(db, "subscription-summary", {"funding_id": f.id, "subscribed_units": sum(s.units for s in subs),
                                       "participants": len(subs)})
    return {"subscription_id": sub.id, "units": sub.units, "link": linked}


def close(db: Session, f: Funding) -> dict:
    """마감·배정: DIBS 우선 배정 명단을 받아 균등 20 / 비례 80으로 확정하고 배정 결과를 보낸다."""
    pri = broker.priority_list(db, f)  # 실제로는 GET /broker/fundings/{id}/priority-list
    res = funding_svc.close_funding(db, f, force=True)
    links = broker._links_by_user(db)
    allocations = [{"link_ref": links[a["user_id"]], "units": a["allocated"]}
                   for a in (res.allocations or []) if a["user_id"] in links]
    ack = _send(db, "allocation-confirmed", {"funding_id": f.id, "allocations": allocations})
    return {"status": res.status, "priority_items": len(pri["items"]), "allocations": len(allocations),
            "priority_honored": ack.get("priority_honored")}


def send_registry(db: Session, f: Funding) -> dict:
    return _send(db, "holder-registry", {"funding_id": f.id, "holders": broker.holdings_registry(db, f)})


def pay(db: Session, run_id: int) -> dict:
    """분배 지시서를 받아 지급(모의: DIBS 모의 예치금으로)하고 원천징수 합계와 함께 완료를 알린다."""
    run = db.get(DividendRun, run_id)
    instr = broker.dividend_instruction(db, run)  # 실제로는 GET /broker/dividend-runs/{id}/instruction
    dividend.pay(db, run_id, force=True)
    tax = sum(int(l["gross"] * 0.154) for l in instr["lines"])
    return _send(db, "payout-completed", {"funding_id": run.funding_id, "run_id": run_id,
                                          "gross": instr["total_gross"], "tax": tax, "count": len(instr["lines"])})


def pay_special(db: Session, special_id: int) -> dict:
    """특별 분배 지시서를 받아 지급(모의: DIBS 모의 예치금으로)하고 완료를 알린다."""
    from app.services import serial

    instr = broker.special_instruction(db, special_id)  # 실제로는 GET /broker/special-distributions/{id}/instruction
    sd = serial.settle_special(db, special_id)
    return _send(db, "payout-completed", {"funding_id": sd.funding_id, "special_id": special_id,
                                          "gross": instr["total"], "count": len(instr["lines"])})
