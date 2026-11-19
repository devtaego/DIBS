"""기획안 v3.0 반영 사항."""
from datetime import datetime, timedelta

from app.core import clock
from tests.conftest import iso, open_funding

SUB = {"agree_risk_notice": True, "agree_no_principal_return": True}


def listed(api, wid, now, units_by_user: dict, target=100):
    f = open_funding(api, wid, now, target_units=target)
    for who, units in units_by_user.items():
        api.ok(who, "post", f"/fundings/{f['id']}/subscriptions", json={**SUB, "units": units})
    api.ok("admin", "post", f"/admin/fundings/{f['id']}/close", params={"force": True})
    api.ok("admin", "post", f"/admin/fundings/{f['id']}/issuance", json={})
    for step, extra in [("FILED", {}), ("ISSUED", {"security_code": "KRDIBS1", "trustee": "T"}),
                        ("LISTING_SCHEDULED", {"listing_date": "2027-03-03"}), ("LISTED", {})]:
        api.ok("admin", "post", f"/admin/fundings/{f['id']}/issuance/advance", json={"step": step, **extra})
    return f["id"]


def test_defaults_min_target_and_equal_allocation(api, published_work, now, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "min_target_amount", 10_000_000)
    body = {"open_at": iso(now), "close_at": iso(now + timedelta(days=7)), "use_of_funds": "작화"}
    api.err("creator", "post", f"/works/{published_work['id']}/fundings", "INVALID_TERMS", json={**body, "target_units": 100})
    f = api.ok("creator", "post", f"/works/{published_work['id']}/fundings", json={**body, "target_units": 1000})
    terms = f["terms"]
    assert terms["allocation_strategy"] == "EQUAL_THEN_PRO_RATA" and terms["allocation_params"] == {"equal_ratio_bps": 2000}
    assert (terms["operating_period_months"], terms["exclusive_months"], terms["external_share_bps"]) == (36, 12, 2000)
    assert terms["maturity_policy"] == "DELIST_NO_REDEMPTION"


def test_consents_and_risk_profile_required(api, published_work, now):
    api.login("a")
    api.login("norisk", kyc=False)
    api.ok("norisk", "post", "/auth/kyc/mock")
    for u in ("a", "norisk"):
        api.ok(u, "post", "/wallet/deposit/charge", json={"amount": 1_000_000})
    f = open_funding(api, published_work["id"], now, target_units=100)
    api.err("a", "post", f"/fundings/{f['id']}/subscriptions", "NO_PRINCIPAL_NOTICE_REQUIRED",
            json={"units": 1, "agree_risk_notice": True})
    api.err("norisk", "post", f"/fundings/{f['id']}/subscriptions", "RISK_PROFILE_REQUIRED", json={**SUB, "units": 1})
    me = api.ok("norisk", "post", "/me/risk-profile", json={"answers": [1, 2, 1, 2, 1]})
    assert me["risk_level"] == "STABLE"
    api.ok("norisk", "post", f"/fundings/{f['id']}/subscriptions", json={**SUB, "units": 1})


def test_breakeven_disclosure(api, published_work, now):
    f = open_funding(api, published_work["id"], now, target_units=1000)
    b = api.ok(None, "get", f"/fundings/{f['id']}/breakeven", params={"price_coin": 300, "monthly_episodes": 4})
    five, principal = b["lines"]
    assert (five["holder_dividend_per_year"], five["net_revenue_per_year"]) == (500_000, 1_250_000)
    assert (five["paid_unlocks_per_month"], five["buyers_per_episode"]) == (496, 124)
    assert principal["goal"] == "3년 안에 원금만큼 배당" and principal["holder_dividend_per_year"] == 3_333_333


def test_external_revenue_after_exclusivity_goes_to_holders(api, published_work, now):
    api.login("a")
    api.ok("a", "post", "/wallet/deposit/charge", json={"amount": 2_000_000})
    fid = listed(api, published_work["id"], now, {"a": 100})
    d = api.ok(None, "get", f"/fundings/{fid}")
    assert d["terms"]["exclusive_until"].startswith("2028-03-02") and d["maturity_date"].startswith("2030-03-02")
    rev = {"funding_id": fid, "source": "EXTERNAL_SERIAL", "gross": 1_000_000, "evidence_url": "s3://settlement.pdf"}
    api.err("admin", "post", "/admin/revenues", "EXCLUSIVE_PERIOD", json={**rev, "period": "2027Q4"})
    api.err("admin", "post", "/admin/revenues", "EVIDENCE_REQUIRED", json={**rev, "period": "2028Q2", "evidence_url": None})
    r = api.ok("admin", "post", "/admin/revenues", json={**rev, "period": "2028Q2"})
    assert r["net"] == 200_000  # 작가 몫 100만 원 × 20%
    api.ok("admin", "post", "/admin/revenues", json={"funding_id": fid, "period": "2028Q2", "source": "AD", "gross": 100_000})
    run = api.ok("admin", "post", f"/admin/fundings/{fid}/dividends", params={"force": True}, json={"period": "2028Q2"})
    assert run["net_revenue"] == 100_000 and run["holder_direct"] == 200_000
    assert run["holder_pool"] == 40_000 + 200_000  # 외부 수익은 30/30/40 으로 나누지 않고 전액 주주 몫
    api.err("admin", "post", f"/admin/fundings/{fid}/dividends", "PERIOD_NOT_ENDED", json={"period": "2028Q3"})


def test_discontinue_distributes_unpaid_payouts(api, published_work, now):
    api.login("a")
    api.login("b")
    for u in ("a", "b"):
        api.ok(u, "post", "/wallet/deposit/charge", json={"amount": 2_000_000})
    fid = listed(api, published_work["id"], now, {"a": 75, "b": 25})
    before = api.ok("b", "get", "/wallet")["deposit_available"]
    out = api.ok("admin", "post", f"/admin/fundings/{fid}/discontinue", json={"reason": "작가 연재 중단 확정"})
    assert out == {"cancelled_payout_amount": 480_000, "distributed": 480_000, "holders": 2}
    assert api.ok("b", "get", "/wallet")["deposit_available"] == before + 120_000
    assert {p["status"] for p in api.ok("admin", "get", f"/admin/fundings/{fid}/payouts")[1:]} == {"CANCELLED"}
    assert api.ok(None, "get", f"/fundings/{fid}")["status"] == "SUSPENDED"
    assert api.ok("b", "get", "/me/notifications")[0]["type"] == "DISCONTINUED_REFUND"


def test_maturity_delists(api, published_work, now):
    api.login("a")
    api.ok("a", "post", "/wallet/deposit/charge", json={"amount": 2_000_000})
    fid = listed(api, published_work["id"], now, {"a": 100})
    api.err("admin", "post", f"/admin/fundings/{fid}/mature", "MATURITY_NOT_REACHED")
    clock.set_now(datetime(2030, 3, 3, 9, 0))
    assert api.ok("admin", "post", f"/admin/fundings/{fid}/mature")["status"] == "MATURED"
    api.err("a", "post", "/market/orders", "NOT_TRADABLE",
            json={"funding_id": fid, "side": "SELL", "price": 10_000, "units": 1, "agree_risk_notice": True})
    assert api.ok(None, "get", f"/market/securities/{fid}")["status"] == "MATURED"
    assert api.ok("a", "get", "/me/notifications")[0]["type"] == "MATURED"


def test_fee_reserve_and_liquidity_metrics(api, published_work, now):
    for u in ("a", "b"):
        api.login(u)
        api.ok(u, "post", "/wallet/deposit/charge", json={"amount": 2_000_000})
    fid = listed(api, published_work["id"], now, {"a": 100})
    order = {"funding_id": fid, "agree_risk_notice": True}
    api.ok("a", "post", "/market/orders", json={**order, "side": "SELL", "price": 10_000, "units": 10})
    api.ok("b", "post", "/market/orders", json={**order, "side": "BUY", "price": 10_000, "units": 10})
    d = api.ok(None, "get", f"/market/securities/{fid}")
    assert (d["volume_7d"], d["trades_7d"], d["price_to_dividend"]) == (10, 1, None)
    tb = {(l["kind"], l["mode"]): l["balance"] for l in api.ok("admin", "get", "/admin/ledger/trial-balance")}
    assert tb[("SYS_FEE_RESERVE", "MOCK")] == (800 + 1000) * 2000 // 10000  # 매수 0.8% + 매도 1% 의 20%


def test_community_rules(api, published_work, now):
    wid = published_work["id"]
    api.login("a")
    api.login("b")
    api.ok("a", "post", "/wallet/deposit/charge", json={"amount": 2_000_000})
    api.err("a", "post", f"/works/{wid}/posts", "CREATOR_ONLY", json={"kind": "BOARD", "body": "공지"})
    board = api.ok("creator", "post", f"/works/{wid}/posts", json={"kind": "BOARD", "body": "다음 주 휴재합니다"})
    assert board["is_creator"]
    api.ok("a", "post", f"/posts/{board['id']}/replies", json={"body": "푹 쉬세요"})
    assert api.ok(None, "get", f"/works/{wid}/posts", params={"kind": "BOARD"})[0]["reply_count"] == 1
    api.err("a", "post", f"/works/{wid}/posts", "IMAGE_REQUIRED", json={"kind": "FANART", "body": "팬아트"})
    ep = api.ok(None, "get", f"/works/{wid}/episodes")[0]
    c = api.ok("b", "post", f"/works/{wid}/posts", json={"kind": "EPISODE_COMMENT", "body": "전개 바꿔라", "episode_id": ep["id"]})

    # 주주 게시판: 보유자만
    api.err("a", "post", f"/works/{wid}/posts", "HOLDERS_ONLY", json={"kind": "HOLDER_BOARD", "body": "배당 언제?"})
    listed(api, wid, now, {"a": 100})
    api.ok("a", "post", f"/works/{wid}/posts", json={"kind": "HOLDER_BOARD", "body": "배당 언제?"})
    api.err("b", "get", f"/works/{wid}/posts", "HOLDERS_ONLY", params={"kind": "HOLDER_BOARD"})

    # 신고 3건 → 자동 숨김, 차단
    for u in ("r1", "r2", "r3"):
        api.login(u)
        rep = api.ok(u, "post", f"/posts/{c['id']}/report", json={"reason": "CREATIVE_PRESSURE"})
    assert rep == {"post_id": c["id"], "report_count": 3, "hidden": True}
    assert api.ok(None, "get", f"/works/{wid}/posts", params={"kind": "EPISODE_COMMENT"}) == []
    assert api.ok("admin", "get", "/admin/reports")[0]["reasons"] == ["CREATIVE_PRESSURE"]
    api.ok("a", "put", f"/users/{api.creator_id}/block")
    assert api.ok("a", "get", f"/works/{wid}/posts", params={"kind": "BOARD"}) == []


def test_profile_broker_policies_notices_creator(api, published_work, now):
    api.login("a")
    me = api.ok("creator", "patch", "/me", json={"bio": "로판 그리는 작가"})
    assert me["bio"] == "로판 그리는 작가"
    assert api.ok("a", "put", "/me/broker-account", json={"broker_name": "제휴증권", "account_no": "123-45-678"})[
        "broker_account_masked"] == "****5678"
    assert "no-principal-return" in {p["key"] for p in api.ok(None, "get", "/policies")}
    api.ok("admin", "post", "/admin/notices", json={"title": "점검 안내", "body": "04:00~04:30", "category": "MAINTENANCE"})
    assert api.ok(None, "get", "/notices")[0]["title"] == "점검 안내"
    cr = api.ok(None, "get", f"/creators/{api.creator_id}")
    assert cr["bio"] == "로판 그리는 작가" and cr["works"][0]["id"] == published_work["id"]


def test_review_metrics_flags_no_read_dibs(api, published_work, now):
    wid = published_work["id"]
    ep = api.ok(None, "get", f"/works/{wid}/episodes")[0]
    for i in range(4):
        api.login(f"u{i}")
        api.ok(f"u{i}", "put", f"/works/{wid}/dib")
    api.ok("u0", "post", "/events", json={"events": [
        {"event_type": "VIEW_COMPLETE", "work_id": wid, "episode_id": ep["id"], "occurred_at": now.isoformat()}]})
    clock.set_now(now + timedelta(days=2))
    m = api.ok("admin", "get", f"/admin/works/{wid}/review-metrics")
    assert (m["dibs_total"], m["dibs_verified"], m["dibs_without_read"]) == (4, 4, 3)
    assert m["dibs_from_new_accounts"] == 4  # 모두 가입 직후 찜
    assert m["eligible_dibs"] == 0
    assert set(m["flags"]) == {"NO_READ_DIBS_HIGH", "NEW_ACCOUNT_DIBS_HIGH"}
    assert m["episodes"][0]["verified_completes"] == 1
