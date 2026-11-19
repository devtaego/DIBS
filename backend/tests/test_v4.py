"""서비스 기획서 v4.0 규칙."""
from datetime import datetime, timedelta

from app.core import clock
from tests.conftest import iso, open_funding

SUB = {"agree_risk_notice": True, "agree_termination_rule": True}
ORDER = {"agree_risk_notice": True}


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


def test_defaults_min_target_cap_and_allocation(api, published_work, now, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "min_target_amount", 30_000_000)
    monkeypatch.setattr(settings, "max_subscription_bps", 500)
    body = {"open_at": iso(now), "close_at": iso(now + timedelta(days=7)), "use_of_funds": "작화"}
    api.err("creator", "post", f"/works/{published_work['id']}/fundings", "INVALID_TERMS", json={**body, "target_units": 2999})
    f = api.ok("creator", "post", f"/works/{published_work['id']}/fundings", json={**body, "target_units": 3000})
    terms = f["terms"]
    assert terms["allocation_strategy"] == "EQUAL_THEN_PRO_RATA"
    assert terms["allocation_params"] == {"equal_ratio_bps": 2000, "early_reader_bps": 1000}
    assert (terms["creator_bps"], terms["issuance_cost_bps"], terms["platform_fee_bps"]) == (8000, 1200, 800)
    assert (terms["royalty_creator_bps"], terms["royalty_holder_bps"], terms["royalty_platform_bps"]) == (3000, 4500, 2500)
    assert (terms["royalty_creator_after_bps"], terms["royalty_holder_after_bps"],
            terms["royalty_platform_after_bps"]) == (4000, 3500, 2500)
    assert (terms["exclusive_months"], terms["external_share_bps"]) == (12, 2000)
    # 1인 한도: min(3,000만 원, 발행액 5% = 150만 원) → 150조각
    assert f["max_units_per_user"] == 150 and f["per_user_cap_units"] == 150
    assert f["risk_grade"] == "매우 높은 위험" and f["recoup"]["phase"] == "BEFORE_RECOUP"


def test_funding_gate_and_target_cap(api, published_work, now, monkeypatch):
    from app.core.config import settings

    wid = published_work["id"]
    g = api.ok(None, "get", f"/works/{wid}/funding-gate", params={"target_amount": 30_000_000})
    # 월 열람자 1명 = 결제율 15% × 월 4화 × 300원 × 0.7 = 126원, 투자자 45%·세후 × 48개월
    assert (g["readers_needed_for_4y"], g["gate_threshold"], g["passes_gate"]) == (13_030, 6_515, False)
    g5 = api.ok(None, "get", f"/works/{wid}/funding-gate", params={"target_amount": 50_000_000})
    assert g5["gate_threshold"] == 10_858
    monkeypatch.setattr(settings, "enforce_funding_gate", True)
    body = {"open_at": iso(now), "close_at": iso(now + timedelta(days=7)), "use_of_funds": "작화", "target_units": 3000}
    api.err("creator", "post", f"/works/{wid}/fundings", "FUNDING_GATE_NOT_MET", json=body)


def test_consents_and_risk_profile_required(api, published_work, now):
    api.login("a")
    api.login("norisk", kyc=False)
    api.ok("norisk", "post", "/auth/kyc/mock")
    for u in ("a", "norisk"):
        api.ok(u, "post", "/wallet/deposit/charge", json={"amount": 1_000_000})
    f = open_funding(api, published_work["id"], now, target_units=100)
    api.err("a", "post", f"/fundings/{f['id']}/subscriptions", "TERMINATION_NOTICE_REQUIRED",
            json={"units": 1, "agree_risk_notice": True})
    api.err("norisk", "post", f"/fundings/{f['id']}/subscriptions", "RISK_PROFILE_REQUIRED", json={**SUB, "units": 1})
    me = api.ok("norisk", "post", "/me/risk-profile", json={"answers": [1, 2, 1, 2, 1]})
    assert me["risk_level"] == "STABLE"
    api.ok("norisk", "post", f"/fundings/{f['id']}/subscriptions", json={**SUB, "units": 1})


def test_early_readers_get_priority_allocation(api, published_work, now):
    """초기 독자 = 모집 7일 전까지 찜 + 모집 전 완독 + 본인인증. 찜만 한 사람은 해당 없음."""
    wid = published_work["id"]
    ep = api.ok(None, "get", f"/works/{wid}/episodes")[0]
    for u in ("early", "dibonly", "late"):
        api.login(u)
        api.ok(u, "post", "/wallet/deposit/charge", json={"amount": 2_000_000})
    for u in ("early", "dibonly"):
        api.ok(u, "put", f"/works/{wid}/dib")
    api.ok("early", "post", "/events", json={"events": [
        {"event_type": "VIEW_COMPLETE", "work_id": wid, "episode_id": ep["id"], "occurred_at": now.isoformat()}]})
    later = now + timedelta(days=8)
    clock.set_now(later)
    api.ok("late", "put", f"/works/{wid}/dib")  # 모집 직전 찜 → 해당 없음
    f = open_funding(api, wid, later, target_units=100, strategy="EQUAL_THEN_PRO_RATA")
    assert api.ok(None, "get", "/fundings", params={"offering_round": "2027-03"})[0]["id"] == f["id"]
    for u in ("early", "dibonly", "late"):
        api.ok(u, "post", f"/fundings/{f['id']}/subscriptions", json={**SUB, "units": 100})
    res = api.ok("admin", "post", f"/admin/fundings/{f['id']}/close", params={"force": True})
    flags = sorted(a["early_reader"] for a in res["allocations"])
    assert flags == [False, False, True]
    early = next(a["allocated"] for a in res["allocations"] if a["early_reader"])
    assert early > max(a["allocated"] for a in res["allocations"] if not a["early_reader"])
    assert sum(a["allocated"] for a in res["allocations"]) == 100


def test_breakeven_disclosure(api, published_work, now):
    f = open_funding(api, published_work["id"], now, target_units=1000)
    b = api.ok(None, "get", f"/fundings/{f['id']}/breakeven", params={"price_coin": 300, "monthly_episodes": 4})
    four, two = b["lines"]
    assert four["goal"] == "4년 안에 원금 회수" and b["royalty_holder_bps"] == 4500
    assert (four["holder_dividend_per_year"], four["net_revenue_per_year"]) == (2_500_000, 6_566_851)
    assert (four["paid_unlocks_per_month"], four["buyers_per_episode"], four["monthly_readers"]) == (2_606, 651, 4_343)
    assert two["goal"] == "2년 안에 원금 회수" and two["monthly_readers"] == 8_686


def test_external_revenue_is_part_of_net_revenue(api, published_work, now):
    api.login("a")
    api.ok("a", "post", "/wallet/deposit/charge", json={"amount": 2_000_000})
    fid = listed(api, published_work["id"], now, {"a": 100})
    d = api.ok(None, "get", f"/fundings/{fid}")
    assert d["terms"]["exclusive_until"].startswith("2028-03-02")
    assert d["termination"]["terminate_due_at"] is None  # 만기 없음, 완결 전
    rev = {"funding_id": fid, "source": "EXTERNAL_SERIAL", "gross": 1_000_000, "evidence_url": "s3://settlement.pdf"}
    api.err("admin", "post", "/admin/revenues", "EXCLUSIVE_PERIOD", json={**rev, "period": "2027Q4"})
    api.err("admin", "post", "/admin/revenues", "EVIDENCE_REQUIRED", json={**rev, "period": "2028Q2", "evidence_url": None})
    r = api.ok("admin", "post", "/admin/revenues", json={**rev, "period": "2028Q2"})
    assert r["net"] == 200_000  # 작가 몫 100만 원 × 20%
    api.ok("admin", "post", "/admin/revenues", json={"funding_id": fid, "period": "2028Q2", "source": "AD", "gross": 100_000})
    run = api.ok("admin", "post", f"/admin/fundings/{fid}/dividends", params={"force": True}, json={"period": "2028Q2"})
    assert run["net_revenue"] == 300_000 and run["holder_pool"] == 135_000  # 순매출에 포함해 45%
    api.err("admin", "post", f"/admin/fundings/{fid}/dividends", "PERIOD_NOT_ENDED", json={"period": "2028Q3"})


def test_recoup_switches_split_from_next_quarter(api, published_work, now):
    api.login("a")
    api.ok("a", "post", "/wallet/deposit/charge", json={"amount": 2_000_000})
    fid = listed(api, published_work["id"], now, {"a": 100})  # 발행액 100만 원
    ad = {"funding_id": fid, "source": "AD"}
    api.ok("admin", "post", "/admin/revenues", json={**ad, "period": "2027Q2", "gross": 3_000_000})
    q2 = api.ok("admin", "post", f"/admin/fundings/{fid}/dividends", params={"force": True}, json={"period": "2027Q2"})
    assert (q2["phase"], q2["holder_pool"], q2["recouped_now"]) == ("BEFORE_RECOUP", 1_350_000, True)
    api.ok("admin", "post", "/admin/revenues", json={**ad, "period": "2027Q3", "gross": 100_000})
    q3 = api.ok("admin", "post", f"/admin/fundings/{fid}/dividends", params={"force": True}, json={"period": "2027Q3"})
    assert q3["phase"] == "AFTER_RECOUP"
    assert (q3["holder_pool"], q3["creator_amount"], q3["platform_amount"]) == (35_000, 40_000, 25_000)
    rec = api.ok(None, "get", f"/fundings/{fid}")["recoup"]
    assert (rec["phase"], rec["recouped_period"], rec["holder_bps_now"]) == ("AFTER_RECOUP", "2027Q2", 3500)
    assert api.ok(None, "get", f"/market/securities/{fid}")["royalty_holder_bps"] == 3500


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


def test_no_maturity_termination_rules(api, published_work, now):
    api.login("a")
    api.ok("a", "post", "/wallet/deposit/charge", json={"amount": 2_000_000})
    fid = listed(api, published_work["id"], now, {"a": 100})
    api.err("admin", "post", f"/admin/fundings/{fid}/terminate", "TERMINATION_NOT_DUE")
    # 저매출 2분기 연속 (발행액 100만 원의 0.5% = 5,000원 미만)
    for period in ("2027Q2", "2027Q3"):
        api.ok("admin", "post", "/admin/revenues", json={"funding_id": fid, "period": period, "source": "AD", "gross": 4_000})
        api.ok("admin", "post", f"/admin/fundings/{fid}/dividends", params={"force": True}, json={"period": period})
    q = api.ok(None, "get", f"/fundings/{fid}/buyback-quote")
    assert (q["low_revenue_streak"], q["eligible"], q["reason"]) == (2, True, "LOW_REVENUE")
    assert api.ok("admin", "post", f"/admin/fundings/{fid}/terminate")["status"] == "TERMINATED"
    api.err("a", "post", "/market/orders", "NOT_TRADABLE",
            json={"funding_id": fid, "side": "SELL", "price": 10_000, "units": 1, **ORDER})
    assert api.ok(None, "get", f"/market/securities/{fid}")["status"] == "TERMINATED"
    assert api.ok("a", "get", "/me/notifications")[0]["type"] == "TERMINATED"


def test_completion_plus_3_years_and_buyback(api, published_work, now):
    for u in ("a", "b"):
        api.login(u)
        api.ok(u, "post", "/wallet/deposit/charge", json={"amount": 2_000_000})
    fid = listed(api, published_work["id"], now, {"a": 60, "b": 40})
    api.ok("admin", "post", f"/admin/fundings/{fid}/complete")
    q = api.ok(None, "get", f"/fundings/{fid}/buyback-quote")
    assert q["terminate_due_at"].startswith("2030-03-02") and not q["eligible"] and q["buyback_price"] is None
    api.err("creator", "post", f"/fundings/{fid}/buyback", "NO_DIVIDEND_HISTORY")
    api.ok("admin", "post", "/admin/revenues", json={"funding_id": fid, "period": "2027Q2", "source": "AD", "gross": 100_000})
    api.ok("admin", "post", f"/admin/fundings/{fid}/dividends", params={"force": True}, json={"period": "2027Q2"})
    assert api.ok(None, "get", f"/fundings/{fid}/buyback-quote")["buyback_price"] == 45_000 * 3
    b_before = api.ok("b", "get", "/wallet")["deposit_available"]
    out = api.ok("creator", "post", f"/fundings/{fid}/buyback")
    assert out == {"price": 135_000, "paid": 135_000, "holders": 2}
    assert api.ok("b", "get", "/wallet")["deposit_available"] == b_before + 54_000
    assert api.ok(None, "get", f"/fundings/{fid}")["status"] == "TERMINATED"
    assert api.ok("a", "get", "/me/notifications")[0]["type"] == "BUYBACK"


def test_trade_fee_goes_to_broker_not_dividends(api, published_work, now):
    for u in ("a", "b"):
        api.login(u)
        api.ok(u, "post", "/wallet/deposit/charge", json={"amount": 2_000_000})
    fid = listed(api, published_work["id"], now, {"a": 100})
    order = {"funding_id": fid, **ORDER}
    api.ok("a", "post", "/market/orders", json={**order, "side": "SELL", "price": 10_000, "units": 10})
    api.ok("b", "post", "/market/orders", json={**order, "side": "BUY", "price": 10_000, "units": 10})
    d = api.ok(None, "get", f"/market/securities/{fid}")
    assert (d["volume_7d"], d["trades_7d"], d["price_to_dividend"]) == (10, 1, None)
    tb = {(l["kind"], l["mode"]): l["balance"] for l in api.ok("admin", "get", "/admin/ledger/trial-balance")}
    assert tb[("SYS_BROKER_FEE", "MOCK")] == 15 + 15  # 10만 원 × 0.015% × 매수·매도


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
    assert "termination-rule" in {p["key"] for p in api.ok(None, "get", "/policies")}
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


def test_indicator_card(api, published_work, now):
    """지표 카드: 찜·파일럿 열람·연독률 → 예상 열람자 → 원금 회수 기간 범위."""
    wid = published_work["id"]
    eps = api.ok(None, "get", f"/works/{wid}/episodes")
    events = []
    for i in range(10):
        events.append({"event_type": "VIEW_START", "work_id": wid, "episode_id": eps[0]["id"],
                       "occurred_at": now.isoformat(), "anon_id": f"dev{i}"})
        events.append({"event_type": "VIEW_COMPLETE", "work_id": wid, "episode_id": eps[0]["id"],
                       "occurred_at": now.isoformat(), "anon_id": f"dev{i}"})
        if i < 6:
            events.append({"event_type": "VIEW_COMPLETE", "work_id": wid, "episode_id": eps[2]["id"],
                           "occurred_at": now.isoformat(), "anon_id": f"dev{i}"})
    api.ok(None, "post", "/events", json={"events": events})
    api.login("a")
    api.ok("a", "put", f"/works/{wid}/dib")
    f = open_funding(api, wid, now, target_units=100)
    card = api.ok(None, "get", f"/fundings/{f['id']}/indicators")
    assert (card["pilot_readers_4w"], card["pilot_read_through"], card["dibs_total"], card["dibs_7d"]) == (10, 0.6, 1, 1)
    assert card["expected_monthly_readers"] == 7
    pb = card["payback_years"]
    assert pb["conservative"] > pb["base"] > pb["optimistic"]


def test_payback_months_matches_plan():
    """기획서 v4.0: 5,000만 원·월 2만 명 → 보수 8.8년 / 기준 4.4년 / 낙관 2.7년 (세후, 월 단위 올림)."""
    from app.services.product import SCENARIOS, payback_months

    got = {k: round(payback_months(50_000_000, 20_000, *v) / 12, 1) for k, v in SCENARIOS.items()}
    assert got == {"conservative": 8.8, "base": 4.4, "optimistic": 2.7}
