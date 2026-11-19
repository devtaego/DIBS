"""연결표(docs/SCREEN_API_MAP.md)에서 새로 필요해진 화면용 API."""
from datetime import timedelta

from app.core import clock
from tests.conftest import iso, open_funding


def list_security(api, fid):
    api.ok("admin", "post", f"/admin/fundings/{fid}/close", params={"force": True})
    api.ok("admin", "post", f"/admin/fundings/{fid}/issuance", json={})
    for step, extra in [("FILED", {}), ("ISSUED", {"security_code": "KRDIBS0000009", "trustee": "T"}),
                        ("LISTING_SCHEDULED", {"listing_date": "2027-03-03"}), ("LISTED", {})]:
        api.ok("admin", "post", f"/admin/fundings/{fid}/issuance/advance", json={"step": step, **extra})


def test_home_and_funding_cards(api, published_work, now):
    wid = published_work["id"]
    api.login("a")
    api.ok("a", "put", f"/works/{wid}/dib")
    assert api.ok(None, "get", "/works")[0]["funding_status"] is None
    f = open_funding(api, wid, now, target_units=100)
    card = api.ok(None, "get", "/works")[0]
    assert (card["dib_count"], card["funding_id"], card["funding_status"]) == (1, f["id"], "OPEN")
    fc = api.ok(None, "get", "/fundings")[0]
    assert fc["work_title"] == published_work["title"] and fc["days_left"] == 7
    assert fc["progress"]["achievement_pct"] == 0.0


def test_studio_sees_own_drafts_and_reviews(api, published_work, now):
    draft = api.ok("creator", "post", "/works", json={"title": "작업 중", "type": "WEBNOVEL", "genre": "무협",
                                                      "rights_declared": True})
    assert {w["status"] for w in api.ok("creator", "get", "/studio/works")} == {"DRAFT", "PUBLISHED"}
    assert api.ok(None, "get", "/works")[0]["id"] != draft["id"]  # 공개 목록에는 없음

    f = api.ok("creator", "post", f"/works/{published_work['id']}/fundings", json={
        "target_units": 100, "open_at": iso(now), "close_at": iso(now + timedelta(days=7)), "use_of_funds": "작화"})
    mine = api.ok("creator", "get", "/studio/fundings")
    assert mine[0]["status"] == "IN_REVIEW"
    api.err(None, "get", f"/fundings/{f['id']}", "FUNDING_NOT_FOUND")  # 공개 상세엔 안 보임
    assert api.ok("admin", "get", f"/admin/fundings/{f['id']}")["status"] == "IN_REVIEW"

    api.login("other", "CREATOR")
    api.err("other", "get", f"/studio/fundings/{f['id']}", "FUNDING_NOT_FOUND")
    api.err("other", "get", "/studio/fundings/999", "FUNDING_NOT_FOUND")


def test_reward_shipping_flow(api, published_work, now):
    api.login("a")
    api.ok("a", "post", "/wallet/deposit/charge", json={"amount": 2_000_000})
    tiers = [{"title": "양장본", "min_units": 10, "requires_shipping": True}, {"title": "크레딧", "min_units": 1}]
    f = open_funding(api, published_work["id"], now, target_units=100, tiers=tiers)
    book = [t for t in api.ok(None, "get", f"/fundings/{f['id']}")["reward_tiers"] if t["title"] == "양장본"][0]
    api.ok("a", "post", f"/fundings/{f['id']}/subscriptions", json={
        "units": 100, "reward_tier_id": book["id"], "shipping": {"name": "A", "address1": "서울"},
        "agree_risk_notice": True, "agree_no_principal_return": True})
    api.ok("admin", "post", f"/admin/fundings/{f['id']}/close", params={"force": True})

    ships = api.ok("creator", "get", f"/studio/fundings/{f['id']}/shipments")
    assert len(ships) == 1 and ships[0]["shipping"]["address1"] == "서울" and ships[0]["tracking_no"] is None
    api.ok("creator", "put", f"/studio/fundings/{f['id']}/shipments/{ships[0]['subscription_id']}",
           json={"carrier": "CJ대한통운", "tracking_no": "1234"})
    sub = api.ok("a", "get", "/me/subscriptions")[0]
    assert (sub["work_title"], sub["assigned_tier_title"], sub["tracking_no"]) == (published_work["title"], "양장본", "1234")
    assert api.ok("a", "get", "/me/notifications")[0]["type"] == "REWARD_SHIPPED"


def test_security_detail_chart_preview_settlement(api, published_work, now):
    for u in ("a", "b"):
        api.login(u)
        api.ok(u, "post", "/wallet/deposit/charge", json={"amount": 2_000_000})
    f = open_funding(api, published_work["id"], now, target_units=100)
    fid = f["id"]
    api.ok("a", "post", f"/fundings/{fid}/subscriptions", json={"units": 100, "agree_risk_notice": True, "agree_no_principal_return": True})
    list_security(api, fid)

    d = api.ok("a", "get", f"/market/securities/{fid}")
    assert (d["my_units"], d["total_units"], d["security_code"]) == (100, 100, "KRDIBS0000009")
    assert d["price_band"] == {"min": 7_000, "max": 13_000} and d["last_dividend"] is None
    assert api.ok(None, "get", f"/market/securities/{fid}")["my_units"] is None

    p = api.ok("b", "get", f"/market/securities/{fid}/order-preview", params={"side": "BUY", "price": 10_000, "units": 5})
    assert (p["gross"], p["fee_bps"], p["fee"], p["total"], p["can_place"]) == (50_000, 80, 400, 50_400, True)
    p = api.ok("b", "get", f"/market/securities/{fid}/order-preview", params={"side": "SELL", "price": 14_000, "units": 1})
    assert set(p["reasons"]) == {"PRICE_OUT_OF_BAND", "INSUFFICIENT_UNITS"} and not p["can_place"]
    p = api.ok("creator", "get", f"/market/securities/{fid}/order-preview", params={"side": "BUY", "price": 10_000, "units": 1})
    assert "SELF_TRADE_FORBIDDEN" in p["reasons"]

    order = {"funding_id": fid, "agree_risk_notice": True, "agree_no_principal_return": True}
    api.ok("a", "post", "/market/orders", json={**order, "side": "SELL", "price": 10_500, "units": 3})
    api.ok("b", "post", "/market/orders", json={**order, "side": "BUY", "price": 10_500, "units": 3})
    clock.set_now(now + timedelta(days=1))
    api.ok("a", "post", "/market/orders", json={**order, "side": "SELL", "price": 11_000, "units": 2})
    api.ok("b", "post", "/market/orders", json={**order, "side": "BUY", "price": 11_000, "units": 2})
    api.ok("a", "post", "/market/orders", json={**order, "side": "SELL", "price": 10_800, "units": 1})
    api.ok("b", "post", "/market/orders", json={**order, "side": "BUY", "price": 10_800, "units": 1})
    candles = api.ok(None, "get", f"/market/securities/{fid}/chart")
    assert len(candles) == 2
    assert candles[1] == {"date": str((now + timedelta(days=1)).date()), "open": 11_000, "high": 11_000,
                          "low": 10_800, "close": 10_800, "volume": 3, "value": 32_800}

    st = api.ok("creator", "get", "/studio/settlements")
    assert st[0]["paid_total"] == 320_000 and st[0]["payouts"][0]["status"] == "PAID"
    assert [p["milestone_note"] for p in st[0]["payouts"]] == ["상장", "10화 연재", "20화 연재 또는 완결"]
