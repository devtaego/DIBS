"""B안 증권사 연계: 청약 넘기기 → 모의 키움 청약(계정 연결·쿠폰) → 우선 배정 → 보유자 명부 → 분배 지시서·지급 완료."""
from datetime import timedelta

from app.core import clock
from app.services import broker
from tests.conftest import open_funding

import pytest

pytestmark = pytest.mark.usefixtures("v5_policy")  # 1조각 10,000원 기준 시나리오

SUB = {"agree_risk_notice": True, "agree_termination_rule": True}


def signed_get(api, path):
    return api.c.get(path, headers={"X-Broker-Signature": broker.sign(f"GET {path}".encode())})


def signed_post(api, path, body, event_id=None):
    h = {"X-Broker-Signature": broker.sign(broker.canonical(body))}
    if event_id:
        h["X-Event-Id"] = event_id
    return api.c.post(path, json=body, headers=h)


def test_b_plan_end_to_end(api, published_work, now):
    wid = published_work["id"]
    ep = api.ok(None, "get", f"/works/{wid}/episodes")[0]
    for u in ("early", "other"):
        api.login(u)
        api.ok(u, "post", "/wallet/deposit/charge", json={"amount": 2_000_000})
    api.ok("early", "put", f"/works/{wid}/dib")
    api.ok("early", "post", "/events", json={"events": [
        {"event_type": "VIEW_COMPLETE", "work_id": wid, "episode_id": ep["id"], "occurred_at": now.isoformat()}]})
    later = now + timedelta(days=8)
    clock.set_now(later)
    f = open_funding(api, wid, later, target_units=100, strategy="EQUAL_THEN_PRO_RATA")
    fid = f["id"]
    assert api.ok(None, "get", "/config/public")["broker_name"] == "키움증권"

    # 1. DIBS 앱 '키움에서 청약하기' → 딥링크 + 서명 토큰
    h = api.ok("early", "post", f"/fundings/{fid}/broker-handoff")
    assert h["deeplink"].startswith("kiwoom-mock://offering/") and not h["linked"]
    # 2. 키움 서버가 토큰 확인 (서명 필요, 회원 번호 대신 가명 id)
    assert signed_post(api, "/broker/handoff/verify", {"token": "x"}).status_code == 400
    api.err(None, "post", "/broker/handoff/verify", "BAD_SIGNATURE", json={"token": h["token"]})
    v = signed_post(api, "/broker/handoff/verify", {"token": h["token"]}).json()
    assert v["funding_id"] == fid and v["user_ref"].startswith("d_") and v["offering"]["target_units"] == 100

    # 3. 모의 키움 청약: 처음이면 계정 연결, 신규 계좌면 쿠폰 코인 지급
    r = api.ok(None, "post", "/dev/mock-kiwoom/subscribe", json={"token": h["token"], "units": 100, "new_account": True})
    assert r["link"]["coupon_coin"] == 20_000
    assert api.ok("early", "get", "/wallet")["coin"] == 20_000
    h2 = api.ok("other", "post", f"/fundings/{fid}/broker-handoff")
    api.ok(None, "post", "/dev/mock-kiwoom/subscribe", json={"token": h2["token"], "units": 100})
    assert api.ok("other", "get", "/wallet")["coin"] == 0
    st = api.ok(None, "get", f"/fundings/{fid}/broker-state")
    assert (st["subscribed_units"], st["participants"]) == (200, 2)

    # 4. 우선 배정 명단: 연결 식별자만, 초기 독자 표시
    pri = signed_get(api, f"/broker/fundings/{fid}/priority-list").json()
    assert [i["reason"] for i in pri["items"]] == ["EARLY_READER"] and pri["unlinked_count"] == 0
    assert api.c.get(f"/broker/fundings/{fid}/priority-list").status_code == 403

    # 5. 마감·배정 → 배정 결과 웹훅, 우선 배정이 지켜졌는지 확인
    c = api.ok(None, "post", f"/dev/mock-kiwoom/fundings/{fid}/close")
    assert c["priority_honored"] is True and c["allocations"] == 2

    # 6. 발행·상장 → 보유자 명부 웹훅
    api.ok("admin", "post", f"/admin/fundings/{fid}/issuance", json={})
    for step, extra in [("FILED", {}), ("ISSUED", {"security_code": "KRDIBS1", "trustee": "T"}),
                        ("LISTING_SCHEDULED", {"listing_date": "2027-03-10"}), ("LISTED", {})]:
        api.ok("admin", "post", f"/admin/fundings/{fid}/issuance/advance", json={"step": step, **extra})
    api.ok(None, "post", f"/dev/mock-kiwoom/fundings/{fid}/registry")
    assert api.ok(None, "get", f"/fundings/{fid}/broker-state")["registry_holders"] == 2

    # 7. 분기 배당 → 분배 지시서(연결 식별자별 세전) → 키움 지급 완료 웹훅, 금액 대조
    api.ok("admin", "post", "/admin/revenues", json={"funding_id": fid, "period": "2027Q2", "source": "AD", "gross": 100_000})
    run = api.ok("admin", "post", f"/admin/fundings/{fid}/dividends", params={"force": True}, json={"period": "2027Q2"})
    ins = signed_get(api, f"/broker/dividend-runs/{run['id']}/instruction").json()
    assert len(ins["lines"]) == 2 and ins["total_gross"] == run["holder_pool"] - run["residual"]
    assert all(l["link_ref"].startswith("kw_") for l in ins["lines"])
    paid = api.ok(None, "post", f"/dev/mock-kiwoom/dividend-runs/{run['id']}/pay")
    assert paid["matched"] is True
    assert api.ok(None, "get", f"/fundings/{fid}/broker-state")["paid_runs"][str(run["id"])]["matched"]

    # 8. 웹훅 재전송은 한 번만 처리
    body = {"funding_id": fid, "subscribed_units": 1, "participants": 1}
    assert signed_post(api, "/broker/webhooks/subscription-summary", body, "evt-1").json()["duplicate"] is False
    assert signed_post(api, "/broker/webhooks/subscription-summary", body, "evt-1").json()["duplicate"] is True


def test_first_time_investor_cap(api, published_work, now):
    api.login("newbie", kyc=False)
    api.ok("newbie", "post", "/auth/kyc/mock")
    api.ok("newbie", "post", "/me/risk-profile", json={"answers": [1, 3, 3, 3, 3]})
    api.ok("newbie", "post", "/wallet/deposit/charge", json={"amount": 1_000_000})
    f = open_funding(api, published_work["id"], now, target_units=100)
    api.err("newbie", "post", f"/fundings/{f['id']}/subscriptions", "FIRST_TIME_CAP", json={**SUB, "units": 11})
    api.ok("newbie", "post", f"/fundings/{f['id']}/subscriptions", json={**SUB, "units": 10})
