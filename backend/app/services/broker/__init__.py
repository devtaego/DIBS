"""증권사 연결 지점 (B안: 읽기는 DIBS, 청약·계좌·보유는 증권사).

거래소 연결을 MarketGateway 한 곳에 모은 것처럼, 증권사와 주고받는 것은 모두 이 모듈을 거친다.
실제 증권사 제휴 API는 계약 후에만 받을 수 있으므로, 여기 정의한 규격은 'DIBS가 제안하는 연동 규격'이다.
dev 모드의 모의 키움 서버(mock_kiwoom)가 이 규격대로 움직여 처음부터 끝까지 시연된다.

원칙
- 계좌번호·실명·연계정보(CI)는 주고받지 않는다. 증권사가 발급한 가명 연결 식별자(link_ref)만 쓴다.
- 청약 현황은 집계만 받는다 (개인별 청약 내역을 받지 않아 미공개 정보 이용 위험을 없앤다).
- 모든 호출은 공유 비밀키 HMAC-SHA256 서명, 웹훅은 event_id 로 중복 처리를 막는다.
- 돈은 DIBS를 거치지 않는다: 청약 대금·분배금은 증권사·신탁사가 처리하고 DIBS는 분배 지시서만 만든다.
"""
import base64
import hashlib
import hmac
import json
import secrets
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import clock
from app.core.config import settings
from app.core.errors import Conflict, DomainError, Forbidden, NotFound
from app.models import (BrokerEvent, BrokerLink, BrokerOfferingState, DividendPayment, DividendRun, Funding,
                        Holding, User, Work)
from app.models.enums import AccountKind, FundingStatus
from app.services import ledger
from app.services.ledger import Leg
from app.services.policy import notify
from app.services.wallet import COIN_MODE

EVENT_TYPES = ("account-linked", "account-unlinked", "subscription-summary", "allocation-confirmed",
               "holder-registry", "payout-completed")


# ───────────────────────────── 서명 ─────────────────────────────

def canonical(payload) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def sign(data: bytes) -> str:
    return hmac.new(settings.broker_shared_secret.encode(), data, hashlib.sha256).hexdigest()


def verify_signature(data: bytes, signature: str | None) -> None:
    if not signature or not hmac.compare_digest(sign(data), signature):
        raise Forbidden("BAD_SIGNATURE", "증권사 서명이 맞지 않아요")


def _b64(d: dict) -> str:
    return base64.urlsafe_b64encode(canonical(d)).decode().rstrip("=")


def _unb64(s: str) -> dict:
    return json.loads(base64.urlsafe_b64decode(s + "=" * (-len(s) % 4)))


def user_ref(user_id: int) -> str:
    """증권사에 보여 주는 DIBS 회원 가명 id (회원 번호를 그대로 넘기지 않음)."""
    return "d_" + sign(f"user:{user_id}".encode())[:20]


# ───────────────────────────── 청약 넘기기 ─────────────────────────────

def issue_handoff(db: Session, user: User, f: Funding) -> dict:
    if f.status != FundingStatus.OPEN:
        raise Conflict("FUNDING_NOT_OPEN", "모집 중인 펀딩만 증권사 청약으로 넘길 수 있어요")
    exp = clock.now() + timedelta(minutes=settings.handoff_ttl_minutes)
    body = _b64({"fid": f.id, "uid": user.id, "exp": exp.isoformat(), "n": secrets.token_hex(6)})
    token = f"{body}.{sign(body.encode())}"
    return {"channel": settings.subscription_channel, "broker": settings.broker_name,
            "deeplink": f"{settings.broker_deeplink_base}/{f.id}?src=dibs&token={token}",
            "token": token, "expires_at": exp, "linked": _link(db, user.id) is not None}


def decode_handoff(token: str) -> dict:
    try:
        body, sig = token.split(".")
    except ValueError:
        raise DomainError("BAD_HANDOFF", "넘김 토큰 형식이 아니에요") from None
    verify_signature(body.encode(), sig)
    d = _unb64(body)
    if clock.now().isoformat() > d["exp"]:
        raise Conflict("HANDOFF_EXPIRED", "넘김 토큰이 만료됐어요. DIBS 앱에서 다시 눌러 주세요")
    return d


def verify_handoff(db: Session, token: str) -> dict:
    """증권사 서버용: 토큰이 진짜인지, 어떤 공모인지 확인 (회원 번호 대신 가명 id를 돌려준다)."""
    d = decode_handoff(token)
    f = db.get(Funding, d["fid"])
    if f is None:
        raise NotFound("FUNDING_NOT_FOUND", "펀딩을 찾을 수 없어요")
    from app.services import product

    work = db.get(Work, f.work_id)
    link = _link(db, d["uid"])
    return {"funding_id": f.id, "user_ref": user_ref(d["uid"]), "linked": link is not None,
            "link_ref": link.link_ref if link else None,
            "offering": {"work_title": work.title, "unit_price": f.unit_price, "target_units": f.target_units,
                         "per_user_cap_units": product.per_user_cap_units(f), "close_at": f.close_at,
                         "status": f.status}}


# ───────────────────────────── 증권사에 주는 데이터 ─────────────────────────────

def _link(db: Session, user_id: int) -> BrokerLink | None:
    return db.scalar(select(BrokerLink).where(BrokerLink.broker == settings.broker_code, BrokerLink.user_id == user_id,
                                              BrokerLink.unlinked_at.is_(None)))


def _links_by_user(db: Session) -> dict[int, str]:
    return {l.user_id: l.link_ref for l in db.scalars(select(BrokerLink).where(
        BrokerLink.broker == settings.broker_code, BrokerLink.unlinked_at.is_(None)))}


def priority_list(db: Session, f: Funding) -> dict:
    """우선 배정 명단 (초기 독자 ∪ 이전 시즌 보유자). 연결된 회원만 가명 연결 식별자로 넘긴다."""
    from app.services.funding import early_readers, prior_season_holders

    prior = prior_season_holders(db, f)
    links = _links_by_user(db)
    items, unlinked = [], 0
    for uid in sorted(early_readers(db, f)):
        if uid not in links:
            unlinked += 1
            continue
        items.append({"link_ref": links[uid], "reason": "PRIOR_HOLDER" if uid in prior else "EARLY_READER"})
    return {"funding_id": f.id, "early_reader_bps": (f.allocation_params or {}).get("early_reader_bps", 0),
            "items": items, "unlinked_count": unlinked}


def dividend_instruction(db: Session, run: DividendRun) -> dict:
    """분배 지시서: 연결 식별자별 세전 분배금. 신탁사·증권사가 지급하고 원천징수는 증권사가 한다."""
    links = _links_by_user(db)
    lines, unlinked = [], []
    for p in db.scalars(select(DividendPayment).where(DividendPayment.run_id == run.id).order_by(DividendPayment.user_id)):
        if p.user_id in links:
            lines.append({"link_ref": links[p.user_id], "units": p.units, "gross": p.gross})
        else:
            unlinked.append({"units": p.units, "gross": p.gross})
    return {"run_id": run.id, "funding_id": run.funding_id, "period": run.period, "pay_date": run.pay_date,
            "holder_pool": run.holder_pool, "total_gross": sum(l["gross"] for l in lines) + sum(u["gross"] for u in unlinked),
            "lines": lines, "unlinked": {"count": len(unlinked), "gross": sum(u["gross"] for u in unlinked)}}


def special_instruction(db: Session, special_id: int) -> dict:
    """특별 분배 지시서 (연재 중단·조기 완결·귀책 유보금·반환금). 원천징수 여부는 증권 형태에 따라 증권사가 정한다."""
    from app.models import SpecialDistribution

    sd = db.get(SpecialDistribution, special_id)
    if sd is None:
        raise NotFound("SPECIAL_NOT_FOUND", "특별 분배 내역을 찾을 수 없어요")
    links = _links_by_user(db)
    lines = [{"link_ref": links[l["user_id"]], "units": l["units"], "amount": l["amount"]}
             for l in sd.lines if l["user_id"] in links]
    unlinked = [l for l in sd.lines if l["user_id"] not in links]
    return {"special_id": sd.id, "funding_id": sd.funding_id, "kind": sd.kind, "status": sd.status,
            "total": sd.amount, "lines": lines,
            "unlinked": {"count": len(unlinked), "amount": sum(l["amount"] for l in unlinked)}}


# ───────────────────────────── 증권사 → DIBS 웹훅 ─────────────────────────────

def _state(db: Session, funding_id: int) -> BrokerOfferingState:
    st = db.scalar(select(BrokerOfferingState).where(BrokerOfferingState.broker == settings.broker_code,
                                                     BrokerOfferingState.funding_id == funding_id))
    if st is None:
        st = BrokerOfferingState(broker=settings.broker_code, funding_id=funding_id, holder_registry={}, paid_runs={})
        db.add(st)
        db.flush()
    return st


def grant_coupon(db: Session, link: BrokerLink) -> int:
    """계좌 개설 쿠폰: 증권사가 산 코인을 신규 계좌 고객에게 지급 (청약 여부와 무관)."""
    if link.coupon_coin or not link.is_new_account:
        return 0
    amt = settings.partner_coupon_coin
    coin = ledger.get_account(db, AccountKind.COIN, COIN_MODE, link.user_id)
    j = ledger.post(db, "PARTNER_COUPON", [Leg(ledger.sys(db, AccountKind.SYS_PARTNER_COUPON, COIN_MODE), -amt),
                                           Leg(coin, amt)], COIN_MODE, "broker_link", link.id,
                    memo=f"{settings.broker_name} 계좌 개설 쿠폰")
    from app.services import coins
    coins.credit(db, link.user_id, "BONUS", amt, j)
    link.coupon_coin = amt
    notify(db, link.user_id, "PARTNER_COUPON", f"{settings.broker_name} 계좌 개설 쿠폰 씨앗 {amt // settings.seed_unit_won:,}개가 들어왔어요",
           "유료 회차를 볼 때 쓸 수 있어요.", "broker_link", link.id)
    return amt


def handle_event(db: Session, event_type: str, event_id: str, payload: dict) -> dict:
    if event_type not in EVENT_TYPES:
        raise NotFound("UNKNOWN_EVENT", f"알 수 없는 이벤트예요: {event_type}")
    if db.scalar(select(BrokerEvent.id).where(BrokerEvent.broker == settings.broker_code, BrokerEvent.event_id == event_id)):
        return {"event_id": event_id, "duplicate": True}
    fid = payload.get("funding_id")
    db.add(BrokerEvent(broker=settings.broker_code, event_id=event_id, event_type=event_type, funding_id=fid,
                       payload=json.loads(canonical(payload))))
    out: dict = {"event_id": event_id, "duplicate": False}

    if event_type == "account-linked":
        uid = decode_handoff(payload["handoff_token"])["uid"] if payload.get("handoff_token") else None
        if uid is None:
            raise DomainError("HANDOFF_REQUIRED", "계정 연결에는 넘김 토큰이 필요해요")
        link = _link(db, uid)
        if link is None:
            link = BrokerLink(user_id=uid, broker=settings.broker_code, link_ref=payload["link_ref"],
                              is_new_account=bool(payload.get("new_account")))
            db.add(link)
            db.flush()
        out.update(link_ref=link.link_ref, coupon_coin=grant_coupon(db, link))
    elif event_type == "account-unlinked":
        link = db.scalar(select(BrokerLink).where(BrokerLink.broker == settings.broker_code,
                                                  BrokerLink.link_ref == payload["link_ref"]))
        if link and not link.unlinked_at:
            link.unlinked_at = clock.now()
    elif event_type == "subscription-summary":
        st = _state(db, fid)
        st.subscribed_units, st.participants = payload["subscribed_units"], payload["participants"]
    elif event_type == "allocation-confirmed":
        st = _state(db, fid)
        st.allocated_units = sum(a["units"] for a in payload["allocations"])
        pri = {i["link_ref"] for i in priority_list(db, db.get(Funding, fid))["items"]}
        out["priority_honored"] = all(a["units"] > 0 for a in payload["allocations"] if a["link_ref"] in pri)
    elif event_type == "holder-registry":
        st = _state(db, fid)
        st.holder_registry = {h["link_ref"]: h["units"] for h in payload["holders"]}
        st.registry_as_of = clock.now()
    elif event_type == "payout-completed" and "special_id" in payload:
        expected = special_instruction(db, payload["special_id"])["total"]
        st = _state(db, payload["funding_id"])
        st.paid_runs = {**st.paid_runs, f"special-{payload['special_id']}": {
            "gross": payload["gross"], "matched": payload["gross"] == expected}}
        out["matched"] = payload["gross"] == expected
    elif event_type == "payout-completed":
        run = db.get(DividendRun, payload["run_id"])
        if run is None:
            raise NotFound("DIVIDEND_NOT_FOUND", "배당 내역을 찾을 수 없어요")
        expected = dividend_instruction(db, run)["total_gross"]
        st = _state(db, run.funding_id)
        st.paid_runs = {**st.paid_runs, str(run.id): {"gross": payload["gross"], "tax": payload["tax"],
                                                       "matched": payload["gross"] == expected}}
        out["matched"] = payload["gross"] == expected
    db.flush()
    return out


def offering_state(db: Session, f: Funding) -> dict:
    st = db.scalar(select(BrokerOfferingState).where(BrokerOfferingState.broker == settings.broker_code,
                                                     BrokerOfferingState.funding_id == f.id))
    return {"funding_id": f.id, "channel": settings.subscription_channel, "broker": settings.broker_name,
            "subscribed_units": st.subscribed_units if st else 0, "participants": st.participants if st else 0,
            "allocated_units": st.allocated_units if st else 0,
            "registry_holders": len(st.holder_registry) if st else 0, "registry_as_of": st.registry_as_of if st else None,
            "paid_runs": st.paid_runs if st else {}}


def holdings_registry(db: Session, f: Funding) -> list[dict]:
    """(모의 증권사용) 보유자 명부 = 연결 회원의 보유 수량."""
    links = _links_by_user(db)
    return [{"link_ref": links[h.user_id], "units": h.units}
            for h in db.scalars(select(Holding).where(Holding.funding_id == f.id, Holding.mode == f.mode,
                                                      Holding.units > 0).order_by(Holding.user_id))
            if h.user_id in links]
