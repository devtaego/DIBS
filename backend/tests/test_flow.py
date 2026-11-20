"""펀딩 → 안분 배정 → 발행·상장 → 거래 → 배당 전체 흐름 (기획안 v2.0 STEP 1~6)."""
from datetime import date, datetime, timedelta

from app.core import clock
from tests.conftest import open_funding


def wallet(api, who):
    return api.ok(who, "get", "/wallet")


def assert_books_balance(api):
    lines = api.ok("admin", "get", "/admin/ledger/trial-balance")
    for mode in {line["mode"] for line in lines}:
        assert sum(line["balance"] for line in lines if line["mode"] == mode) == 0


def test_full_flow(api, published_work, now):
    wid = published_work["id"]
    for u in ("a", "b", "c"):
        api.login(u)
        api.ok(u, "post", "/wallet/deposit/charge", json={"amount": 3_000_000})
    api.ok("a", "put", f"/works/{wid}/dib")

    tiers = [{"title": "에필로그 크레딧", "min_units": 1},
             {"title": "한정판 양장본", "min_units": 30, "limited_qty": 1, "requires_shipping": True}]
    f = open_funding(api, wid, now, target_units=100, max_units=250, tiers=tiers)
    fid = f["id"]
    credit, book = [t["id"] for t in api.ok(None, "get", f"/fundings/{fid}")["reward_tiers"]]

    # 찜한 회원에게 오픈 알림
    assert api.ok("a", "get", "/me/notifications")[0]["type"] == "DIBBED_FUNDING_OPEN"

    # ── STEP 2. 청약 ──
    sub = {"agree_risk_notice": True, "agree_termination_rule": True}
    api.err("creator", "post", f"/fundings/{fid}/subscriptions", "SELF_INVEST_FORBIDDEN", json={**sub, "units": 1})
    api.err("a", "post", f"/fundings/{fid}/subscriptions", "MAX_UNITS_EXCEEDED", json={**sub, "units": 251})
    api.err("a", "post", f"/fundings/{fid}/subscriptions", "SHIPPING_REQUIRED",
            json={**sub, "units": 200, "reward_tier_id": book})
    api.ok("a", "post", f"/fundings/{fid}/subscriptions",
           json={**sub, "units": 200, "reward_tier_id": book, "shipping": {"name": "A", "address1": "서울"}})
    api.err("b", "post", f"/fundings/{fid}/subscriptions", "TIER_SOLD_OUT",
            json={**sub, "units": 200, "reward_tier_id": book, "shipping": {"name": "B"}})
    api.ok("b", "post", f"/fundings/{fid}/subscriptions", json={**sub, "units": 200, "reward_tier_id": credit})
    api.ok("c", "post", f"/fundings/{fid}/subscriptions", json={**sub, "units": 30})
    api.ok("c", "patch", f"/fundings/{fid}/subscriptions/me", json={"units": 21})  # 감액 가능

    assert wallet(api, "a")["deposit_locked"] == 2_000_000
    detail = api.ok(None, "get", f"/fundings/{fid}")
    assert detail["progress"]["achievement_pct"] == 421.0  # 100% 초과 표시
    assert detail["progress"]["participants"] == 3

    # 마감 1시간 전부터 감액·취소 잠금
    close_at = datetime.fromisoformat(f["close_at"])
    clock.set_now(close_at - timedelta(minutes=30))
    api.err("b", "patch", f"/fundings/{fid}/subscriptions/me", "SUBSCRIPTION_LOCKED", json={"units": 100})
    api.err("b", "delete", f"/fundings/{fid}/subscriptions/me", "SUBSCRIPTION_LOCKED")

    # ── STEP 3. 마감·안분 배정 ──
    clock.set_now(close_at)
    result = api.ok("admin", "post", f"/admin/fundings/{fid}/close")
    got = {a["requested"]: a["allocated"] for a in result["allocations"]}
    assert result["status"] == "ALLOCATED"
    # 200·200·21 → 내림 47·47·4, 남은 2조각은 소수부 큰 c(416) → a(213, 먼저 청약)
    assert sorted(a["allocated"] for a in result["allocations"]) == [5, 47, 48]
    assert got[21] == 5
    assert wallet(api, "a") == {"mode": "MOCK", "coin": 0, "deposit_available": 2_520_000, "deposit_locked": 0}
    assert wallet(api, "c")["deposit_available"] == 3_000_000 - 50_000
    a_sub = api.ok("a", "get", f"/fundings/{fid}/subscriptions/me")
    assert a_sub["allocated_units"] == 48 and a_sub["assigned_tier_id"] == book
    assert_books_balance(api)

    # ── STEP 4. 발행 ──
    api.ok("admin", "post", f"/admin/fundings/{fid}/issuance", json={"broker_name": "제휴증권"})
    api.err("admin", "post", f"/admin/fundings/{fid}/issuance/advance", "INVALID_ISSUANCE_STEP", json={"step": "LISTED"})
    api.ok("admin", "post", f"/admin/fundings/{fid}/issuance/advance", json={"step": "FILED"})
    api.err("admin", "post", f"/admin/fundings/{fid}/issuance/advance", "ISSUANCE_INFO_REQUIRED", json={"step": "ISSUED"})
    api.ok("admin", "post", f"/admin/fundings/{fid}/issuance/advance",
           json={"step": "ISSUED", "security_code": "KRDIBS0000001", "trustee": "OO신탁"})
    api.ok("admin", "post", f"/admin/fundings/{fid}/issuance/advance",
           json={"step": "LISTING_SCHEDULED", "listing_date": "2027-03-10"})
    clock.set_now(datetime(2027, 3, 10, 9, 0))
    iss = api.ok("admin", "post", f"/admin/fundings/{fid}/issuance/advance", json={"step": "LISTED"})
    assert len(iss["history"]) == 5

    # 보유 증권 반영 + 작가 지급: 작가 몫 85만 원(모금액의 85%) 중 상장 시 40%만 (v3.0 분할 지급)
    assert api.ok("a", "get", "/me/holdings")[0]["units"] == 48
    assert wallet(api, "creator")["deposit_available"] == 340_000
    payouts = api.ok("admin", "get", f"/admin/fundings/{fid}/payouts")
    assert [(p["amount"], p["status"]) for p in payouts] == [(340_000, "PAID"), (255_000, "PENDING"), (255_000, "PENDING")]
    assert_books_balance(api)

    # ── STEP 5. 마켓 ──
    clock.set_now(datetime(2027, 3, 10, 10, 0))
    order = {"funding_id": fid, "agree_risk_notice": True, "agree_termination_rule": True}
    api.err("b", "post", "/market/orders", "PRICE_OUT_OF_BAND", json={**order, "side": "BUY", "price": 13_001, "units": 1})
    api.err("b", "post", "/market/orders", "PRICE_TICK", json={**order, "side": "BUY", "price": 10_050, "units": 1})  # 100원 단위
    api.err("creator", "post", "/market/orders", "SELF_TRADE_FORBIDDEN", json={**order, "side": "BUY", "price": 10_000, "units": 1})
    api.err("c", "post", "/market/orders", "INSUFFICIENT_UNITS", json={**order, "side": "SELL", "price": 11_000, "units": 6})
    api.ok("a", "post", "/market/orders", json={**order, "side": "SELL", "price": 11_000, "units": 10})
    api.ok("b", "post", "/market/orders", json={**order, "side": "BUY", "price": 10_900, "units": 6})  # 가격 다름 → 미체결
    buy = api.ok("b", "post", "/market/orders", json={**order, "side": "BUY", "price": 11_000, "units": 6})
    assert buy["status"] == "FILLED" and buy["fee_ppm"] == 150  # 0.015% (거래소·증권사 몫)

    book_ = api.ok(None, "get", f"/market/securities/{fid}/orderbook")
    assert book_["asks"] == [{"price": 11_000, "units": 4, "orders": 1}]
    assert book_["bids"] == [{"price": 10_900, "units": 6, "orders": 1}]
    assert book_["last_price"] == 11_000

    assert wallet(api, "a")["deposit_available"] == 2_520_000 + 66_000 - 9  # 매도 수수료 0.015% (원 미만 절사)
    b_hold = api.ok("b", "get", "/me/holdings")[0]
    assert b_hold["units"] == 53 and b_hold["avg_price"] == (47 * 10_000 + 6 * 11_000) // 53
    a_hold = api.ok("a", "get", "/me/holdings")[0]
    assert a_hold["units"] == 42 and a_hold["locked_units"] == 4

    clock.set_now(datetime(2027, 3, 11, 4, 10))
    api.err("b", "post", "/market/orders", "MARKET_MAINTENANCE", json={**order, "side": "BUY", "price": 11_000, "units": 1})
    clock.set_now(datetime(2027, 3, 11, 0, 1))  # 자정 자동 취소
    assert api.ok("admin", "post", "/admin/jobs/expire-orders")["affected"] == 2
    assert api.ok("a", "get", "/me/holdings")[0]["locked_units"] == 0
    assert api.ok("a", "get", "/me/orders")[0]["status"] == "EXPIRED"
    api.ok("admin", "post", "/admin/jobs/roll-reference-prices")
    assert api.ok(None, "get", f"/market/securities/{fid}/orderbook")["price_band"] == {"min": 7_700, "max": 14_300}
    assert_books_balance(api)

    # ── STEP 6. 유료 회차 → 매출 → 분기 배당 ──
    clock.set_now(datetime(2027, 3, 20, 12, 0))
    ep3 = api.ok(None, "get", f"/works/{wid}/episodes")[3]  # 4화 (파일럿 1~3화는 무료)
    api.ok("admin", "patch", f"/admin/episodes/{ep3['id']}/pricing", json={"is_paid": True, "price_coin": 500})
    api.err("c", "get", f"/episodes/{ep3['id']}", "PAYMENT_REQUIRED")
    api.err("c", "post", f"/episodes/{ep3['id']}/unlock", "INSUFFICIENT_BALANCE")
    for u in ("a", "c"):
        api.ok(u, "post", "/wallet/coin/charge", json={"amount": 1_000})
        api.ok(u, "post", f"/episodes/{ep3['id']}/unlock")
    assert wallet(api, "c")["coin"] == 500
    api.ok("c", "get", f"/episodes/{ep3['id']}")  # 한 번 열면 계속 열람

    period = {"period": "2027Q1"}
    rev = api.ok("admin", "post", f"/admin/fundings/{fid}/revenues/aggregate", json=period)
    assert (rev["gross"], rev["deductions"], rev["net"]) == (1_000, 300, 700)  # 인앱 수수료 30% 공제
    api.ok("admin", "post", "/admin/revenues", json={"funding_id": fid, **period, "source": "AD", "gross": 100_000})
    api.ok("admin", "post", "/admin/revenues",
           json={"funding_id": fid, **period, "source": "GOODS", "gross": 50_000, "deductions": 20_000})

    clock.set_now(datetime(2027, 4, 1, 9, 0))
    run = api.ok("admin", "post", f"/admin/fundings/{fid}/dividends", json=period)
    assert run["net_revenue"] == 130_700 and run["phase"] == "BEFORE_RECOUP"
    # 회수 전 투자자 45 / 작가 30 / DIBS 25. 거래 수수료는 배당 재원이 아니다 (v4.0)
    assert (run["holder_pool"], run["creator_amount"], run["platform_amount"]) == (58_815, 39_210, 32_675)
    assert run["total_units"] == 100 and run["residual"] == 2 and not run["recouped_now"]
    assert run["record_date"] == "2027-03-31" and run["pay_date"] == "2027-04-10"

    api.err("admin", "post", f"/admin/dividends/{run['id']}/pay", "BEFORE_PAY_DATE")
    before = wallet(api, "a")["deposit_available"]
    clock.set_now(datetime(2027, 4, 10, 9, 0))
    api.ok("admin", "post", f"/admin/dividends/{run['id']}/pay")

    mine = api.ok("a", "get", "/me/dividends")[0]
    assert (mine["units"], mine["gross"], mine["tax"], mine["net"]) == (42, 24_702, 3_804, 20_898)
    assert wallet(api, "a")["deposit_available"] == before + 20_898
    # 회수 전 작가 몫의 50%는 신탁에 유보 (회수·종료 때 작가에게)
    assert run["creator_escrow"] == 19_605
    assert wallet(api, "creator")["deposit_available"] == 340_000 + 39_210 - 19_605
    assert api.ok("a", "get", "/me/notifications")[0]["type"] == "DIVIDEND_PAID"
    assert_books_balance(api)


def test_failed_funding_releases_all(api, published_work, now):
    api.login("a")
    api.ok("a", "post", "/wallet/deposit/charge", json={"amount": 500_000})
    f = open_funding(api, published_work["id"], now, target_units=100)
    api.ok("a", "post", f"/fundings/{f['id']}/subscriptions",
           json={"units": 10, "agree_risk_notice": True, "agree_termination_rule": True})
    clock.set_now(now + timedelta(days=7))
    assert api.ok("admin", "post", f"/admin/fundings/{f['id']}/close")["status"] == "FAILED"
    assert wallet(api, "a") == {"mode": "MOCK", "coin": 0, "deposit_available": 500_000, "deposit_locked": 0}
    assert api.ok("a", "get", "/me/notifications")[0]["type"] == "FUNDING_FAILED"


def test_issue_failure_refunds_and_cancels_rewards(api, published_work, now):
    api.login("a")
    api.ok("a", "post", "/wallet/deposit/charge", json={"amount": 2_000_000})
    f = open_funding(api, published_work["id"], now, target_units=100, tiers=[{"title": "크레딧", "min_units": 1}])
    tier = api.ok(None, "get", f"/fundings/{f['id']}")["reward_tiers"][0]["id"]
    api.ok("a", "post", f"/fundings/{f['id']}/subscriptions", json={"units": 150, "reward_tier_id": tier,
                                                                   "agree_risk_notice": True, "agree_termination_rule": True})
    api.ok("admin", "post", f"/admin/fundings/{f['id']}/close", params={"force": True})
    api.ok("admin", "post", f"/admin/fundings/{f['id']}/issuance", json={})
    api.ok("admin", "post", f"/admin/fundings/{f['id']}/issuance/fail", json={"reason": "증권신고서 미수리"})
    assert wallet(api, "a")["deposit_available"] == 2_000_000
    sub = api.ok("a", "get", f"/fundings/{f['id']}/subscriptions/me")
    assert sub["status"] == "REFUNDED" and sub["assigned_tier_id"] is None


def test_investment_limit_and_kyc(api, published_work, now):
    api.login("a")
    api.login("nokyc", kyc=False)
    for _ in range(7):  # 모의 충전은 1회 500만 원까지
        api.ok("a", "post", "/wallet/deposit/charge", json={"amount": 5_000_000})
    f = open_funding(api, published_work["id"], now, target_units=1000)
    body = {"agree_risk_notice": True, "agree_termination_rule": True}
    api.err("nokyc", "post", f"/fundings/{f['id']}/subscriptions", "KYC_REQUIRED", json={**body, "units": 1})
    # 1인 청약 한도 3,000만 원 (= 일반투자자 종목당 한도)
    api.err("a", "post", f"/fundings/{f['id']}/subscriptions", "MAX_UNITS_EXCEEDED", json={**body, "units": 3001})
    api.ok("a", "post", f"/fundings/{f['id']}/subscriptions", json={**body, "units": 3000})  # 3,000만 원
    lim = api.ok("a", "get", f"/fundings/{f['id']}/limits")
    # 일반투자자: 종목당 3,000만 원, 연 1억 원 (장외거래소 순매수 한도)
    assert lim["security_remaining"] == 0 and lim["annual_remaining"] == 70_000_000


def test_coin_and_deposit_are_separated(api, db_session_factory, now):
    from app.core.errors import DomainError
    from app.models.enums import AccountKind, Mode
    from app.services import ledger

    api.login("a")
    api.ok("a", "post", "/wallet/coin/charge", json={"amount": 10_000})
    api.ok("a", "post", "/wallet/deposit/charge", json={"amount": 10_000})
    api.err("a", "post", "/wallet/deposit/to-coin", "MOCK_DEPOSIT_TO_COIN", json={"amount": 1_000})

    db = db_session_factory()
    coin = ledger.get_account(db, AccountKind.COIN, Mode.LIVE, 1)
    dep = ledger.get_account(db, AccountKind.DEPOSIT, Mode.LIVE, 1)
    try:
        ledger.post(db, "HACK", [ledger.Leg(coin, -100), ledger.Leg(dep, 100)], Mode.LIVE)
        raise AssertionError("코인 → 예치금 이동이 허용됨")
    except DomainError as e:
        assert e.code == "COIN_TO_DEPOSIT_FORBIDDEN"
    finally:
        db.rollback()
        db.close()


def test_pilot_free_and_preview_free_after_21_days(api, published_work, now):
    """v4.0: 파일럿 1~3화 무료, 4화부터 유료 미리보기(300원)를 발행 전에도 열 수 있고 공개 21일 뒤 무료."""
    wid = published_work["id"]
    eps = api.ok(None, "get", f"/works/{wid}/episodes")
    api.err("admin", "patch", f"/admin/episodes/{eps[2]['id']}/pricing", "PILOT_FREE", json={"is_paid": True})
    ep4 = api.ok("admin", "patch", f"/admin/episodes/{eps[3]['id']}/pricing", json={"is_paid": True})
    assert (ep4["is_paid"], ep4["price_coin"]) == (True, 300)
    assert ep4["free_unlock_at"].startswith("2027-03-23")
    api.login("r")
    api.err("r", "get", f"/episodes/{ep4['id']}", "PAYMENT_REQUIRED")
    api.ok("r", "post", "/wallet/coin/charge", json={"amount": 1_000})
    api.ok("r", "post", f"/episodes/{ep4['id']}/unlock")
    s = api.ok("admin", "get", f"/admin/works/{wid}/pre-issuance-settlement",
               params={"since": "2027-03-01T00:00:00", "until": "2027-04-01T00:00:00"})
    assert (s["gross"], s["net"], s["creator_amount"], s["platform_amount"]) == (300, 210, 147, 63)  # 작가 70 / DIBS 30
    clock.set_now(now + timedelta(days=21))
    api.login("late")
    assert api.ok(None, "get", f"/works/{wid}/episodes")[3]["is_paid"] is False
    api.ok("late", "get", f"/episodes/{ep4['id']}")  # 공개 21일 뒤 무료


def test_event_metrics_read_through(api, published_work, now):
    wid = published_work["id"]
    eps = api.ok(None, "get", f"/works/{wid}/episodes")
    ts = now.isoformat()
    events = []
    for user in ("x1", "x2", "x3"):
        events += [{"event_type": "VIEW_START", "anon_id": user, "work_id": wid, "episode_id": eps[0]["id"], "occurred_at": ts},
                   {"event_type": "VIEW_COMPLETE", "anon_id": user, "work_id": wid, "episode_id": eps[0]["id"], "occurred_at": ts}]
    for user in ("x1", "x2"):
        events += [{"event_type": "VIEW_START", "anon_id": user, "work_id": wid, "episode_id": eps[1]["id"], "occurred_at": ts},
                   {"event_type": "VIEW_COMPLETE", "anon_id": user, "work_id": wid, "episode_id": eps[1]["id"], "occurred_at": ts}]
    events.append({"event_type": "VIEW_START", "anon_id": "x1", "work_id": wid, "episode_id": eps[2]["id"],
                   "occurred_at": ts, "progress": 0.4})
    assert api.ok(None, "post", "/events", json={"events": events})["accepted"] == 11
    api.err(None, "post", "/events", "ANON_ID_REQUIRED",
            json={"events": [{"event_type": "WORK_VIEW", "work_id": wid, "occurred_at": ts}]})

    m = api.ok("creator", "get", f"/works/{wid}/metrics")
    assert m["unique_readers"] == 3
    ep = {e["no"]: e for e in m["episodes"]}
    assert ep[1]["read_through_rate"] == 1.0
    assert ep[2]["read_through_rate"] == round(2 / 3, 4)
    assert ep[3]["unique_starts"] == 1 and ep[3]["read_through_rate"] == 0.0
    assert len(api.ok("admin", "get", "/admin/events/export")) == 11


def test_suspension_cancels_open_orders(api, published_work, now):
    api.login("a")
    api.ok("a", "post", "/wallet/deposit/charge", json={"amount": 2_000_000})
    f = open_funding(api, published_work["id"], now, target_units=100)
    fid = f["id"]
    api.ok("a", "post", f"/fundings/{fid}/subscriptions", json={"units": 100, "agree_risk_notice": True, "agree_termination_rule": True})
    api.ok("admin", "post", f"/admin/fundings/{fid}/close", params={"force": True})
    api.ok("admin", "post", f"/admin/fundings/{fid}/issuance", json={})
    for step, extra in [("FILED", {}), ("ISSUED", {"security_code": "X", "trustee": "T"}),
                        ("LISTING_SCHEDULED", {"listing_date": str(date(2027, 3, 3))}), ("LISTED", {})]:
        api.ok("admin", "post", f"/admin/fundings/{fid}/issuance/advance", json={"step": step, **extra})
    api.ok("a", "post", "/market/orders", json={"funding_id": fid, "side": "SELL", "price": 10_000, "units": 10,
                                                "agree_risk_notice": True, "agree_termination_rule": True})
    api.ok("admin", "post", f"/admin/fundings/{fid}/suspension", json={"suspended": True, "reason": "권리 분쟁"})
    assert api.ok("a", "get", "/me/holdings")[0]["locked_units"] == 0
    api.err("a", "post", "/market/orders", "NOT_TRADABLE",
            json={"funding_id": fid, "side": "SELL", "price": 10_000, "units": 1, "agree_risk_notice": True, "agree_termination_rule": True})
