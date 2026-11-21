"""서비스 기획서 v4.0·v5.0 규칙 (v5.0: 시즌 단위·유료 팬 기준·결제 시점 신탁 분할)."""
import pytest
from datetime import datetime, timedelta

from app.core import clock
from tests.conftest import iso, open_funding

SUB = {"agree_risk_notice": True, "agree_termination_rule": True}
ORDER = {"agree_risk_notice": True}

pytestmark = pytest.mark.usefixtures("v5_policy")


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
    assert (terms["creator_bps"], terms["issuance_cost_bps"], terms["platform_fee_bps"]) == (8500, 1200, 300)
    assert terms["buyback_enabled"] is False
    assert (terms["royalty_creator_bps"], terms["royalty_holder_bps"], terms["royalty_platform_bps"]) == (3000, 4500, 2500)
    assert (terms["royalty_creator_after_bps"], terms["royalty_holder_after_bps"],
            terms["royalty_platform_after_bps"]) == (4000, 3500, 2500)
    assert (terms["exclusive_months"], terms["external_share_bps"]) == (12, 2000)
    # 1인 한도: min(3,000만 원, 발행액 5% = 150만 원) → 150조각
    assert f["max_units_per_user"] == 150 and f["per_user_cap_units"] == 150
    assert f["risk_grade"] == "매우 높은 위험" and f["recoup"]["phase"] == "BEFORE_RECOUP"


def paid_fans(api, wid, n, prefix="fan"):
    """n명이 4화(유료 미리보기 300원)를 산다 = 월 유료 팬 n명."""
    eps = api.ok(None, "get", f"/works/{wid}/episodes")
    ep4 = eps[3]
    if not ep4["is_paid"]:
        api.ok("admin", "patch", f"/admin/episodes/{ep4['id']}/pricing", json={"is_paid": True})
    for i in range(n):
        u = f"{prefix}{i}"
        api.login(u)
        api.ok(u, "post", "/wallet/coin/charge", json={"amount": 1_000})
        api.ok(u, "post", f"/episodes/{ep4['id']}/unlock")
    return ep4


def test_funding_gate_and_target_cap(api, published_work, now, monkeypatch):
    from app.core.config import settings

    wid = published_work["id"]
    g = api.ok(None, "get", f"/works/{wid}/funding-gate", params={"target_amount": 10_000_000})
    # 유료 팬 1명당 상품 기간(시즌 12 + 완결 후 12개월) 투자자 몫(세후) 약 4,217원 × 70% → 1,000만 원에 3,388명
    assert (g["paying_fans_needed"], g["gate_threshold"], g["passes_gate"]) == (3_388, 3_388, False)
    assert api.ok(None, "get", f"/works/{wid}/funding-gate", params={"target_amount": 30_000_000})["gate_threshold"] == 10_163
    paid_fans(api, wid, 3)
    g = api.ok(None, "get", f"/works/{wid}/funding-gate", params={"target_amount": 10_000_000})
    assert g["pilot_paying_fans_4w"] == 3 and g["target_cap"] == 0 and not g["within_cap"]
    monkeypatch.setattr(settings, "enforce_funding_gate", True)
    body = {"open_at": iso(now), "close_at": iso(now + timedelta(days=7)), "use_of_funds": "작화", "target_units": 1000}
    api.err("creator", "post", f"/works/{wid}/fundings", "FUNDING_GATE_NOT_MET", json=body)


def test_season_cap_and_scenarios_match_plan():
    """기획서 v5.0: 1,000만 원·유료 팬 3,388명 → 0.4배 0.70x / 0.7배 1.19x / 1배 1.65x(10개월) / 1.5배 2.36x."""
    from app.services import product

    need = product.paying_fans_needed(10_000_000)
    assert product.target_cap(3_400) == 10_000_000
    got = {r: product.simulate(10_000_000, need * r) for r in (0.4, 0.7, 1.0, 1.5)}
    assert {r: g["multiple"] for r, g in got.items()} == {0.4: 0.7, 0.7: 1.19, 1.0: 1.65, 1.5: 2.36}
    assert (got[0.4]["payback_months"], got[1.0]["payback_months"]) == (None, 10)


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
    season, term = b["lines"]
    assert season["goal"] == "시즌 연재 기간 안에 원금 회수 (12개월)" and b["royalty_holder_bps"] == 4500
    assert (season["holder_dividend_per_year"], season["buyers_per_episode"]) == (10_000_000, 2_606)
    assert term["goal"] == "상품 기간 안에 원금 회수 (24개월)" and term["buyers_per_episode"] == 1_943


def test_external_revenue_is_part_of_net_revenue(api, published_work, now):
    api.login("a")
    api.ok("a", "post", "/wallet/deposit/charge", json={"amount": 2_000_000})
    fid = listed(api, published_work["id"], now, {"a": 100})
    d = api.ok(None, "get", f"/fundings/{fid}")
    assert d["terms"]["exclusive_until"].startswith("2028-03-02")
    assert d["termination"]["terminate_due_at"] is None  # 완결 전
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
    assert out == {"kind": "NO_FAULT", "cancelled_payout_amount": 510_000, "distributed": 510_000, "holders": 2,
                   "escrow_forfeited": 0, "reserve_distributed": 0, "clawback_due": 0, "clawback_outstanding": 0}
    assert api.ok("b", "get", "/wallet")["deposit_available"] == before + 127_500
    assert {p["status"] for p in api.ok("admin", "get", f"/admin/fundings/{fid}/payouts")[1:]} == {"CANCELLED"}
    assert api.ok(None, "get", f"/fundings/{fid}")["status"] == "SUSPENDED"
    assert api.ok("b", "get", "/me/notifications")[0]["type"] == "SPECIAL_DISCONTINUE"


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


def test_completion_plus_12_months_and_optional_buyback(api, published_work, now):
    for u in ("a", "b"):
        api.login(u)
        api.ok(u, "post", "/wallet/deposit/charge", json={"amount": 2_000_000})
    fid = listed(api, published_work["id"], now, {"a": 60, "b": 40})
    api.ok("admin", "post", f"/admin/fundings/{fid}/complete")
    q = api.ok(None, "get", f"/fundings/{fid}/buyback-quote")
    # 조기 완결이라도 '완결 후 12개월'과 '상장 후 24개월' 중 늦은 쪽까지 권리 유지
    assert q["terminate_due_at"].startswith("2029-03-02") and not q["eligible"]
    assert (q["buyback_enabled"], q["buyback_price"]) == (False, None)
    api.err("creator", "post", f"/fundings/{fid}/buyback", "BUYBACK_NOT_ENABLED")
    clock.set_now(now + timedelta(days=366))
    assert not api.ok(None, "get", f"/fundings/{fid}/buyback-quote")["eligible"]
    clock.set_now(now + timedelta(days=731))
    q = api.ok(None, "get", f"/fundings/{fid}/buyback-quote")
    assert (q["eligible"], q["reason"]) == (True, "COMPLETED_TERM")


def test_buyback_when_selected(api, published_work, now):
    for u in ("a", "b"):
        api.login(u)
        api.ok(u, "post", "/wallet/deposit/charge", json={"amount": 2_000_000})
    f = api.ok("creator", "post", f"/works/{published_work['id']}/fundings", json={
        "target_units": 100, "open_at": iso(now), "close_at": iso(now + timedelta(days=7)),
        "use_of_funds": "작화", "buyback_enabled": True})
    api.ok("admin", "post", f"/admin/fundings/{f['id']}/review", json={"approve": True, "terms": {}})
    api.ok("admin", "post", f"/admin/fundings/{f['id']}/open")
    for who, units in {"a": 60, "b": 40}.items():
        api.ok(who, "post", f"/fundings/{f['id']}/subscriptions", json={**SUB, "units": units})
    api.ok("admin", "post", f"/admin/fundings/{f['id']}/close", params={"force": True})
    api.ok("admin", "post", f"/admin/fundings/{f['id']}/issuance", json={})
    for step, extra in [("FILED", {}), ("ISSUED", {"security_code": "KRDIBS1", "trustee": "T"}),
                        ("LISTING_SCHEDULED", {"listing_date": "2027-03-03"}), ("LISTED", {})]:
        api.ok("admin", "post", f"/admin/fundings/{f['id']}/issuance/advance", json={"step": step, **extra})
    fid = f["id"]
    api.err("creator", "post", f"/fundings/{fid}/buyback", "NO_DIVIDEND_HISTORY")
    api.ok("admin", "post", "/admin/revenues", json={"funding_id": fid, "period": "2027Q2", "source": "AD", "gross": 100_000})
    api.ok("admin", "post", f"/admin/fundings/{fid}/dividends", params={"force": True}, json={"period": "2027Q2"})
    assert api.ok(None, "get", f"/fundings/{fid}/buyback-quote")["buyback_price"] == 45_000 * 3
    b_before = api.ok("b", "get", "/wallet")["deposit_available"]
    out = api.ok("creator", "post", f"/fundings/{fid}/buyback")
    assert out == {"price": 135_000, "paid": 135_000, "holders": 2}
    assert api.ok("b", "get", "/wallet")["deposit_available"] == b_before + 54_000
    assert api.ok(None, "get", f"/fundings/{fid}")["status"] == "TERMINATED"


def test_payment_goes_to_trust_and_disclosure_reconciles(api, published_work, now):
    """결제 시점 분할: 상장 작품 결제는 신탁 계좌로 바로. 공시에서 결제 원천 = 신탁 입금 = 배당 재원을 대사한다."""
    wid = published_work["id"]
    api.login("a")
    api.ok("a", "post", "/wallet/deposit/charge", json={"amount": 2_000_000})
    paid_fans(api, wid, 1, prefix="pre")  # 상장 전 결제 → DIBS 코인 매출 (발행 전 정산 대상)
    clock.set_now(now + timedelta(hours=1))
    fid = listed(api, wid, now, {"a": 100})
    paid_fans(api, wid, 2, prefix="post")  # 상장 후 결제 → 신탁 계좌
    tb = {(l["kind"], l["mode"]): l["balance"] for l in api.ok("admin", "get", "/admin/ledger/trial-balance")}
    assert tb[("SYS_TRUST_RECEIVABLE", "LIVE")] == 600 and tb[("SYS_COIN_REVENUE", "LIVE")] == 300
    d = api.ok(None, "get", f"/fundings/{fid}/disclosure")
    assert d["cost_per_100"] == {"creator": 85.0, "issuance_cost": 12.0, "reserve": 0.0, "dibs": 3.0}
    assert d["term"] == {"fixed_term": True, "season_months": 12, "after_completion_months": 12,
                         "principal_repayment": False}
    r = d["reconciliation"][0]
    assert (r["period"], r["unlock_gross"], r["trust_inflow"], r["leaked_unlocks"], r["matched"]) == (
        "2027Q1", 600, 600, 0, True)
    assert r["recorded_gross"] is None and len(r["ledger_hash"]) == 64 and r["records"] == 2
    api.ok("admin", "post", f"/admin/fundings/{fid}/revenues/aggregate", json={"period": "2027Q1"})
    r2 = api.ok(None, "get", f"/fundings/{fid}/disclosure")["reconciliation"][0]
    assert r2["recorded_gross"] == 600 and r2["matched"] and r2["ledger_hash"] == r["ledger_hash"]


def test_prior_season_holders_get_priority_next_season(api, published_work, now):
    wid = published_work["id"]
    for u in ("holder", "newbie"):
        api.login(u)
        api.ok(u, "post", "/wallet/deposit/charge", json={"amount": 3_000_000})
    s1 = listed(api, wid, now, {"holder": 100})
    api.err("creator", "post", f"/works/{wid}/fundings", "FUNDING_ALREADY_ACTIVE", json={
        "target_units": 100, "open_at": iso(now), "close_at": iso(now + timedelta(days=7)), "use_of_funds": "시즌2"})
    api.ok("admin", "post", f"/admin/fundings/{s1}/complete")  # 시즌 1 완결 → 시즌 2 신청 가능
    s2 = open_funding(api, wid, now, target_units=100, strategy="EQUAL_THEN_PRO_RATA")
    for u in ("holder", "newbie"):
        api.ok(u, "post", f"/fundings/{s2['id']}/subscriptions", json={**SUB, "units": 100})
    res = api.ok("admin", "post", f"/admin/fundings/{s2['id']}/close", params={"force": True})
    by = {a["early_reader"]: a["allocated"] for a in res["allocations"]}
    assert by[True] > by[False]


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


def test_indicator_card(api, published_work, now, monkeypatch):
    """지표 카드: 찜·파일럿 열람·연독률·유료 팬 → 시나리오별 배수와 회수 기간, 1인 최대 손실."""
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
    paid_fans(api, wid, 4)
    f = open_funding(api, wid, now, target_units=100)
    from app.core.config import settings

    monkeypatch.setattr(settings, "max_subscription_bps", 500)
    card = api.ok(None, "get", f"/fundings/{f['id']}/indicators")
    assert (card["pilot_readers_4w"], card["pilot_read_through"], card["dibs_total"], card["dibs_7d"]) == (10, 0.6, 1, 1)
    assert (card["pilot_paying_fans_4w"], card["season_months"], card["tail_months"]) == (4, 12, 12)
    sc = card["scenarios"]
    m = [sc[k]["multiple"] for k in ("downside", "conservative", "base", "optimistic")]
    assert m == sorted(m) and m[-1] > m[0]
    assert card["per_user_cap_amount"] == 50_000  # 발행액 100만 원 × 5%
    assert 0 < card["per_user_max_loss_downside"] <= 50_000


def test_deadline_reminders_once(api, published_work, now):
    """마감 2일 안이면 청약자·찜한 회원에게 마감 임박 알림을 한 번씩 보낸다."""
    api.login("rem_sub")
    api.login("rem_dib")
    api.ok("rem_sub", "post", "/wallet/deposit/charge", json={"amount": 1_000_000})
    api.ok("rem_dib", "put", f"/works/{published_work['id']}/dib")
    f = open_funding(api, published_work["id"], now, target_units=100)
    api.ok("rem_sub", "post", f"/fundings/{f['id']}/subscriptions", json={**SUB, "units": 1})
    from app.core import clock
    from datetime import timedelta
    from app.services import reminders
    close = clock.datetime.fromisoformat(f["close_at"]) if isinstance(f["close_at"], str) else f["close_at"]
    clock.set_now(close - timedelta(days=1, hours=2))
    try:
        assert api.ok("admin", "post", "/admin/jobs/deadline-reminders")["sent"] >= 2
        assert api.ok("admin", "post", "/admin/jobs/deadline-reminders")["sent"] == 0  # 두 번째는 보내지 않음
    finally:
        clock.set_now(now)
    types = {n["type"] for n in api.ok("rem_sub", "get", "/me/notifications")}
    assert "DEADLINE_SOON" in types
    assert "DIBBED_DEADLINE_SOON" in {n["type"] for n in api.ok("rem_dib", "get", "/me/notifications")}
    assert reminders.REMIND_DAYS == 2


def test_attendance_and_partner_points(api):
    """출석 코인은 하루 한 번, 키움 포인트는 100P 단위로 코인만 된다 (예치금 아님)."""
    api.login("att1")
    before = api.ok("att1", "get", "/wallet")
    r = api.ok("att1", "post", "/me/attendance")
    assert r["granted"] == 50 and r["checked"] and r["streak"] == 1 and r["filled"] == 1
    api.err("att1", "post", "/me/attendance", code="ALREADY_ATTENDED")
    p = api.ok("att1", "get", "/me/partner-points")
    api.err("att1", "post", "/me/partner-points/convert", json={"points": 150}, code="BAD_POINTS")
    p2 = api.ok("att1", "post", "/me/partner-points/convert", json={"points": 300})
    assert p2["balance"] == p["balance"] - 300
    after = api.ok("att1", "get", "/wallet")
    assert after["coin"] == before["coin"] + 350
    assert after["deposit_available"] == before["deposit_available"]


def test_attendance_ladder(api, now):
    """3일째 200, 7일째 300, 하루 빠지면 처음부터."""
    from datetime import timedelta
    from app.core import clock
    api.login("att2")
    got = []
    try:
        for d in [0, 1, 2, 3, 4, 5, 6, 8]:
            clock.set_now(now + timedelta(days=d))
            got.append(api.ok("att2", "post", "/me/attendance")["granted"])
    finally:
        clock.set_now(now)
    assert got == [50, 50, 200, 50, 50, 50, 300, 50]
