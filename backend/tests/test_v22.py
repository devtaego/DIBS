"""기획서 v2.2 + 화면설계도 MVP v2 조정값 (docs/DECISIONS-v2.2.md).

1조각 1,000원 · 모금액 80/12/5/3 · 창작자 토큰 5%(12개월 보호예수) · 배당 재원 60/30/10 · 만기 없음 ·
보유 한도 10% · 시장가 주문 · 씨앗(100원) 묶음·환불·만료 · 회원 단계 · 19세 작품 · 출금 규칙.
"""
from datetime import date, timedelta

from app.core import clock
from tests.conftest import open_funding

SUB = {"agree_risk_notice": True, "agree_termination_rule": True}
ORDER = {"agree_risk_notice": True}


def listed(api, wid, now, units_by_user: dict, target=1000):
    f = open_funding(api, wid, now, target_units=target)
    assert f["unit_price"] == 1_000  # v2.2: 1조각 = 1,000원
    for who, units in units_by_user.items():
        api.ok(who, "post", f"/fundings/{f['id']}/subscriptions", json={**SUB, "units": units})
    api.ok("admin", "post", f"/admin/fundings/{f['id']}/close", params={"force": True})
    api.ok("admin", "post", f"/admin/fundings/{f['id']}/issuance", json={})
    for step, extra in [("FILED", {}), ("ISSUED", {"security_code": "KRDIBS22", "trustee": "T"}),
                        ("LISTING_SCHEDULED", {"listing_date": "2027-03-03"}), ("LISTED", {})]:
        api.ok("admin", "post", f"/admin/fundings/{f['id']}/issuance/advance", json={"step": step, **extra})
    return f["id"]


def balances(api):
    return {(l["kind"], l["mode"]): l["balance"] for l in api.ok("admin", "get", "/admin/ledger/trial-balance")}


def test_listing_split_80_12_5_3_and_creator_token(api, published_work, now):
    for u in ("a", "b"):
        api.login(u)
        api.ok(u, "post", "/wallet/deposit/charge", json={"amount": 2_000_000})
    fid = listed(api, published_work["id"], now, {"a": 900, "b": 100})  # 모금액 100만 원

    tb = balances(api)
    assert tb[("SYS_ISSUANCE_COST", "MOCK")] == 120_000  # 발행 실비 12%
    assert tb[("SYS_TRUST_RESERVE", "MOCK")] == 50_000  # 최소 유보금 5% (신탁)
    assert tb[("SYS_PLATFORM_REVENUE", "MOCK")] == 30_000  # DIBS 운영비 3%
    # 작가 몫 80만 원 중 상장 때 40% 지급
    assert api.ok("creator", "get", "/wallet")["deposit_available"] == 320_000

    # 창작자 토큰: 전체 발행량의 5% → 투자자 1,000조각이면 창작자 52조각 (52 / 1,052 ≈ 4.9%)
    h = api.ok("creator", "get", "/me/holdings")
    assert len(h) == 1 and h[0]["units"] == 52
    api.err("creator", "post", "/market/orders", "CREATOR_LOCKUP",
            json={**ORDER, "funding_id": fid, "side": "SELL", "price": 1_000, "units": 10})
    api.err("creator", "post", "/market/orders", "SELF_TRADE_FORBIDDEN",
            json={**ORDER, "funding_id": fid, "side": "BUY", "price": 1_000, "units": 1})
    clock.set_now(now + timedelta(days=366))  # 보호예수 12개월이 지나면 매도만 가능
    o = api.ok("creator", "post", "/market/orders", json={**ORDER, "funding_id": fid, "side": "SELL", "price": 1_000,
                                                          "units": 10})
    assert o["status"] == "OPEN"

    d = api.ok(None, "get", f"/fundings/{fid}/disclosure")
    assert d["cost_per_100"] == {"creator": 80.0, "issuance_cost": 12.0, "reserve": 5.0, "dibs": 3.0}
    assert d["creator_token"] == {"bps": 500, "lockup_months": 12}
    assert d["term"]["fixed_term"] is False and d["term"]["season_months"] is None


def test_dividend_split_60_30_10_without_recoup_switch(api, published_work, now):
    api.login("a")
    api.ok("a", "post", "/wallet/deposit/charge", json={"amount": 2_000_000})
    fid = listed(api, published_work["id"], now, {"a": 1000})
    ad = {"funding_id": fid, "source": "AD"}
    for period, gross in (("2027Q2", 3_000_000), ("2027Q3", 1_000_000)):  # 원금 회수 뒤에도 비율이 그대로
        api.ok("admin", "post", "/admin/revenues", json={**ad, "period": period, "gross": gross})
        run = api.ok("admin", "post", f"/admin/fundings/{fid}/dividends", params={"force": True}, json={"period": period})
        assert (run["holder_pool"], run["creator_amount"], run["platform_amount"]) == (
            gross * 30 // 100, gross * 60 // 100, gross * 10 // 100)
    term = api.ok(None, "get", f"/fundings/{fid}/buyback-quote")
    assert term["eligible"] is False and term["terminate_due_at"] is None  # 만기 없음


def test_holding_cap_10_percent_and_market_order(api, published_work, now):
    for u in ("a", "b", "c"):
        api.login(u)
        api.ok(u, "post", "/wallet/deposit/charge", json={"amount": 2_000_000})
    fid = listed(api, published_work["id"], now, {"a": 900, "b": 100})  # 전체 1,052조각 (창작자 52 포함) → 1인 105조각

    # 보유 한도: b는 100조각 보유, 5조각까지만 더 살 수 있다
    api.err("b", "post", "/market/orders", "HOLDING_LIMIT_EXCEEDED",
            json={**ORDER, "funding_id": fid, "side": "BUY", "price": 1_000, "units": 6})
    api.ok("a", "post", "/market/orders", json={**ORDER, "funding_id": fid, "side": "SELL", "price": 1_010, "units": 3})

    # 시장가: 최우선 매도호가(1,010원)에서 체결하고 남은 수량은 취소
    o = api.ok("c", "post", "/market/orders", json={**ORDER, "funding_id": fid, "side": "BUY", "order_type": "MARKET",
                                                    "units": 5})
    assert (o["price"], o["remaining_units"], o["status"]) == (1_010, 2, "CANCELLED")
    w = api.ok("c", "get", "/wallet")
    fee = 3 * 1_010 * 150 // 1_000_000  # 0.015%, 원 미만 버림
    assert w["deposit_locked"] == 0 and w["deposit_available"] == 2_000_000 - 3 * 1_010 - fee
    api.err("c", "post", "/market/orders", "NO_COUNTER_ORDER",
            json={**ORDER, "funding_id": fid, "side": "BUY", "order_type": "MARKET", "units": 1})
    api.err("c", "post", "/market/orders", "INVALID_ORDER", json={**ORDER, "funding_id": fid, "side": "BUY", "units": 1})

    # 거래 수수료는 Dibs 수입 (기획서 1-3): 10만 원 체결 → 매수·매도 각 15원
    before = balances(api)[("SYS_PLATFORM_REVENUE", "MOCK")]
    api.ok("a", "post", "/market/orders", json={**ORDER, "funding_id": fid, "side": "SELL", "price": 1_000, "units": 100})
    api.ok("c", "post", "/market/orders", json={**ORDER, "funding_id": fid, "side": "BUY", "price": 1_000, "units": 100})
    assert balances(api)[("SYS_PLATFORM_REVENUE", "MOCK")] - before == 30


def test_seed_packages_lots_refund_and_expiry(api, published_work, now, monkeypatch):
    from app.core.config import settings

    wid = published_work["id"]
    api.login("r")
    pk = {p["id"]: p for p in api.ok(None, "get", "/wallet/coin/packages")}
    assert (pk["seed55"]["total_seeds"], pk["seed55"]["price"], pk["seed55"]["iap_price"]) == (55, 5_000, 5_500)

    r = api.ok("r", "post", "/wallet/coin/packages/buy", json={"package_id": "seed55", "channel": "IAP"})
    assert r["paid_amount"] == 5_500 and r["wallet"]["coin"] == 5_500 and r["wallet"]["seeds"] == 55
    assert sorted((l["source"], l["amount"]) for l in r["lots"]) == [("BONUS", 500), ("IAP", 5_000)]

    # 4화(유료 미리보기 300원 = 씨앗 3개)를 열면 보너스 씨앗부터 쓴다
    ep4 = api.ok(None, "get", f"/works/{wid}/episodes")[3]
    # 상장 전에는 유료 미리보기를 열 수 없다 (공개 회차는 무료). 씨앗 차감 확인을 위해 이 테스트에서만 허용
    api.err("admin", "patch", f"/admin/episodes/{ep4['id']}/pricing", "NOT_LISTED_YET", json={"is_paid": True})
    monkeypatch.setattr(settings, "paid_preview_before_listing", True)
    ep4 = api.ok("admin", "patch", f"/admin/episodes/{ep4['id']}/pricing", json={"is_paid": True, "price_coin": 300})
    assert ep4["price_seeds"] == 3
    api.ok("r", "post", f"/episodes/{ep4['id']}/unlock")
    lots = {l["source"]: l for l in api.ok("r", "get", "/wallet/coin/lots")}
    assert lots["BONUS"]["remaining"] == 200 and lots["IAP"]["remaining"] == 5_000

    # PG 충전분은 7일 안에 안 썼으면 결제 취소, 인앱은 스토어 규칙이라 여기서 취소 불가
    pg = api.ok("r", "post", "/wallet/coin/packages/buy", json={"package_id": "seed10", "channel": "PG"})["lots"][0]
    assert api.ok("r", "post", f"/wallet/coin/lots/{pg['id']}/refund")["status"] == "REFUNDED"
    api.err("r", "post", f"/wallet/coin/lots/{lots['IAP']['id']}/refund", "NOT_REFUNDABLE")
    pg2 = api.ok("r", "post", "/wallet/coin/packages/buy", json={"package_id": "seed10", "channel": "PG"})["lots"][0]
    # 7일이 지나면 결제 취소 대신 남은 씨앗을 계좌로 환불 (1,000원 이상)
    clock.set_now(now + timedelta(days=8))
    assert api.ok("r", "post", f"/wallet/coin/lots/{pg2['id']}/refund")["status"] == "REFUNDED"

    # 보너스 씨앗은 90일 뒤 만료
    clock.set_now(now + timedelta(days=91))
    job = api.ok("admin", "post", "/admin/jobs/expire-coins")
    assert job == {"expired_lots": 1, "expired_coin": 200}
    assert api.ok("r", "get", "/wallet")["coin"] == 5_000  # 인앱 5,000 (유료분은 5년)


def test_member_level_age_rating_and_underage(api, published_work, now):
    wid = published_work["id"]
    api.login("new", kyc=False)
    assert api.ok("new", "get", "/me")["level"] == "L1"
    assert api.ok("new", "post", "/auth/kyc/mock")["level"] == "L2"
    api.ok("new", "post", "/me/risk-profile", json={"answers": [3, 3, 3, 3, 3]})
    me = api.ok("new", "put", "/me/broker-account", json={"broker_name": "키움증권", "account_no": "1000-1234-5678"})
    assert me["level"] == "L3"

    api.ok("creator", "patch", f"/works/{wid}", json={"age_rating": "19"})
    ep1 = api.ok(None, "get", f"/works/{wid}/episodes")[0]
    api.err(None, "get", f"/episodes/{ep1['id']}", "ADULT_ONLY")
    api.login("teen", kyc=False)
    api.ok("teen", "post", "/auth/kyc/mock", json={"birth_date": "2010-05-01"})
    api.err("teen", "get", f"/episodes/{ep1['id']}", "ADULT_ONLY")
    assert api.ok("new", "get", f"/episodes/{ep1['id']}")["no"] == 1

    f = open_funding(api, wid, now, target_units=1000)
    api.ok("teen", "post", "/me/risk-profile", json={"answers": [3, 3, 3, 3, 3]})
    api.ok("teen", "post", "/wallet/deposit/charge", json={"amount": 100_000})
    api.err("teen", "post", f"/fundings/{f['id']}/subscriptions", "UNDERAGE", json={**SUB, "units": 10})


def test_withdrawal_rules(api, now):
    api.login("w")
    api.ok("w", "post", "/wallet/deposit/charge", json={"amount": 5_000_000})
    api.err("w", "post", "/wallet/deposit/withdrawals", "WITHDRAW_MIN", json={"amount": 999})
    assert api.ok("w", "post", "/wallet/deposit/withdrawals", json={"amount": 10_000})["status"] == "APPROVED"
    api.ok("w", "put", "/me/broker-account", json={"broker_name": "키움증권", "account_no": "1000-1234-5678"})
    api.ok("w", "put", "/me/broker-account", json={"broker_name": "키움증권", "account_no": "2000-1234-9999"})
    api.err("w", "post", "/wallet/deposit/withdrawals", "ACCOUNT_CHANGE_HOLD", json={"amount": 10_000})
    clock.set_now(now + timedelta(hours=25))
    assert api.ok("w", "post", "/wallet/deposit/withdrawals", json={"amount": 10_000})["status"] == "APPROVED"


def test_large_withdrawal_needs_approval(api, now):
    api.login("admin", "ADMIN")
    api.login("big")
    for _ in range(3):
        api.ok("big", "post", "/wallet/deposit/charge", json={"amount": 5_000_000})
    assert api.ok("big", "post", "/wallet/deposit/withdrawals", json={"amount": 10_000_000})["status"] == "APPROVED"
    req = api.ok("big", "post", "/wallet/deposit/withdrawals", json={"amount": 5_000_000})
    assert req["status"] == "APPROVED"
    api.ok("big", "post", "/wallet/deposit/charge", json={"amount": 5_000_000})
    api.ok("big", "post", "/wallet/deposit/charge", json={"amount": 5_000_000})
    api.ok("big", "post", "/wallet/deposit/charge", json={"amount": 1_000_000})
    # 1회 1,000만 원을 넘으면 운영자(FIN) 승인 대기
    assert api.ok("big", "post", "/wallet/deposit/withdrawals", json={"amount": 10_000_001})["status"] == "PENDING"


# ── 데이터팀 지표 뷰 수정 반영 (v_work_metrics_pre · v_work_metrics_post, 2026-11-21) ──

def test_reader_change_1w(api, published_work, now):
    """[추가] 직전 7일 대비 최근 7일 회차 뷰어(VIEW_START) 순독자 변화율, 직전 0명이면 빈칸."""
    wid = published_work["id"]
    ep1 = api.ok(None, "get", f"/works/{wid}/episodes")[0]
    assert api.ok(None, "get", f"/works/{wid}")["reader_change_1w"] is None  # 직전 7일 0명

    def view(anon, days_ago):
        return {"event_type": "VIEW_START", "occurred_at": (now - timedelta(days=days_ago)).isoformat(),
                "anon_id": anon, "work_id": wid, "episode_id": ep1["id"]}

    events = [view("p1", 10), view("p2", 9), view("p2", 8),  # 직전 7일: 2명 (p2 두 번은 1명)
              view("r1", 3), view("r2", 2), view("r3", 1), view("r1", 1)]  # 최근 7일: 3명
    api.ok(None, "post", "/events", json={"events": events})
    m = api.ok("creator", "get", f"/works/{wid}/metrics")
    assert (m["readers_prev_7d"], m["readers_last_7d"], m["reader_change_1w"]) == (2, 3, 0.5)
    assert api.ok(None, "get", f"/works/{wid}")["reader_change_1w"] == 0.5


def test_dividend_metrics_use_confirmed_quarters_only(api, published_work, now):
    """[재산출] 토큰당 배당·연 배당수익률은 확정(지급 완료) 분기만, 진행 중 분기는 제외."""
    api.login("a")
    api.ok("a", "post", "/wallet/deposit/charge", json={"amount": 2_000_000})
    fid = listed(api, published_work["id"], now, {"a": 1000})  # 전체 1,052조각
    ad = {"funding_id": fid, "source": "AD"}
    clock.set_now(now.replace(month=7, day=15))  # 2027Q3 진행 중
    for period in ("2027Q2", "2027Q3"):
        api.ok("admin", "post", "/admin/revenues", json={**ad, "period": period, "gross": 1_052_000})
        run = api.ok("admin", "post", f"/admin/fundings/{fid}/dividends", params={"force": True}, json={"period": period})
        api.ok("admin", "post", f"/admin/dividends/{run['id']}/pay", params={"force": True})
    s = api.ok(None, "get", f"/market/securities/{fid}")
    assert s["last_dist_period"] == "2027Q2"  # 진행 중인 2027Q3은 지급했어도 제외
    assert s["last_dist_per_token"] == 300.0  # 315,600원 ÷ 1,052조각
    assert s["annual_dist_yield"] == round(300 / 1_000, 6)  # 확정 분기 합 ÷ 현재가(공모가 1,000원)


def test_secondary_ip_revenue_split_like_primary(api, published_work, now):
    """2차·해외 IP 수익은 실비만 빼고 1차 매출과 같은 60/30/10 (증빙 필수)."""
    api.login("a")
    api.ok("a", "post", "/wallet/deposit/charge", json={"amount": 2_000_000})
    fid = listed(api, published_work["id"], now, {"a": 1000})
    ip = {"funding_id": fid, "source": "SECONDARY_IP", "period": "2027Q2", "gross": 5_000_000, "deductions": 1_000_000}
    api.err("admin", "post", "/admin/revenues", "EVIDENCE_REQUIRED", json=ip)
    api.ok("admin", "post", "/admin/revenues", json={**ip, "evidence_url": "s3://dibs/contracts/drama-license.pdf"})
    run = api.ok("admin", "post", f"/admin/fundings/{fid}/dividends", params={"force": True}, json={"period": "2027Q2"})
    assert (run["net_revenue"], run["holder_pool"], run["creator_amount"], run["platform_amount"]) == (
        4_000_000, 1_200_000, 2_400_000, 400_000)


def test_paid_preview_opens_only_after_listing(api, published_work, now):
    """상장 전 공개 회차는 무료. 유료 미리보기는 상장 후에만 열 수 있다."""
    wid = published_work["id"]
    ep4 = api.ok(None, "get", f"/works/{wid}/episodes")[3]
    api.err("admin", "patch", f"/admin/episodes/{ep4['id']}/pricing", "NOT_LISTED_YET", json={"is_paid": True})
    # 무료로 되돌리는 건 언제든 된다
    api.ok("admin", "patch", f"/admin/episodes/{ep4['id']}/pricing", json={"is_paid": False})
    api.login("inv")
    api.ok("inv", "post", "/wallet/deposit/charge", json={"amount": 1_000_000})
    listed(api, wid, now, {"inv": 1000})
    ep = api.ok("admin", "patch", f"/admin/episodes/{ep4['id']}/pricing", json={"is_paid": True, "price_coin": 300})
    assert ep["is_paid"] is True


def test_funding_gate_uses_readers_times_pay_rate_before_listing(api, published_work, now):
    """상장 전에는 유료 구매자가 없으므로 월 유료 팬 = 파일럿 4주 열람자 × 15%."""
    wid = published_work["id"]
    ep1 = api.ok(None, "get", f"/works/{wid}/episodes")[0]
    api.ok(None, "post", "/events", json={"events": [
        {"event_type": "VIEW_START", "work_id": wid, "episode_id": ep1["id"], "anon_id": f"a{i}",
         "occurred_at": now.isoformat()} for i in range(20)]})
    g = api.ok(None, "get", f"/works/{wid}/funding-gate")
    assert g["fans_basis"] == "READERS_X_PAY_RATE"
    assert g["pilot_readers_4w"] == 20 and g["pilot_paying_fans_4w"] == 0
    assert g["expected_paying_fans"] == 3  # 20 × 15%


def test_pg_refund_revokes_bonus_and_min_amount(api, now):
    api.login("p")
    r = api.ok("p", "post", "/wallet/coin/packages/buy", json={"package_id": "seed55", "channel": "PG"})
    pg = next(l for l in r["lots"] if l["source"] == "PG")
    # 7일 안, 미사용 → 결제 취소. 함께 받은 보너스 씨앗 5개도 회수
    assert api.ok("p", "post", f"/wallet/coin/lots/{pg['id']}/refund")["status"] == "REFUNDED"
    assert api.ok("p", "get", "/wallet")["coin"] == 0
    lots = {l["source"]: l for l in api.ok("p", "get", "/wallet/coin/lots")}
    assert lots["BONUS"]["status"] == "REFUNDED" and lots["BONUS"]["parent_lot_id"] == pg["id"]


def test_iap_refund_reclaims_and_offsets_next_charge(api, published_work, now, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "paid_preview_before_listing", True)
    wid = published_work["id"]
    api.login("q")
    r = api.ok("q", "post", "/wallet/coin/packages/buy", json={"package_id": "seed10", "channel": "IAP"})
    iap = r["lots"][0]
    ep4 = api.ok(None, "get", f"/works/{wid}/episodes")[3]
    api.ok("admin", "patch", f"/admin/episodes/{ep4['id']}/pricing", json={"is_paid": True, "price_coin": 300})
    api.ok("q", "post", f"/episodes/{ep4['id']}/unlock")  # 인앱 씨앗 3개 사용 → 700원 남음
    out = api.ok("admin", "post", f"/admin/coin/lots/{iap['id']}/iap-refund")
    assert out == {"lot_id": iap["id"], "reclaimed": 700, "debt_added": 300, "coin_debt": 300}
    assert api.ok("q", "get", "/wallet")["coin_debt"] == 300
    api.err("admin", "post", f"/admin/coin/lots/{iap['id']}/iap-refund", "ALREADY_REFUNDED")
    # 다음 충전 1,000원 중 300원을 먼저 상계
    w = api.ok("q", "post", "/wallet/coin/packages/buy", json={"package_id": "seed10", "channel": "PG"})["wallet"]
    assert w["coin"] == 700 and w["coin_debt"] == 0


def test_guest_reads_only_first_episode(api, published_work):
    eps = api.ok(None, "get", f"/works/{published_work['id']}/episodes")
    api.ok(None, "get", f"/episodes/{eps[0]['id']}")
    api.err(None, "get", f"/episodes/{eps[1]['id']}", "LOGIN_REQUIRED")
    api.login("g")
    api.ok("g", "get", f"/episodes/{eps[1]['id']}")


def test_failed_funding_retry_cooldown_30_days(api, published_work, now):
    wid = published_work["id"]
    f = open_funding(api, wid, now, target_units=1000)
    assert api.ok("admin", "post", f"/admin/fundings/{f['id']}/close", params={"force": True})["status"] == "FAILED"
    body = {"target_units": 1000, "open_at": (now + timedelta(days=1)).isoformat(),
            "close_at": (now + timedelta(days=8)).isoformat(), "use_of_funds": "작화 60%, 마케팅 40%", "reward_tiers": []}
    api.err("creator", "post", f"/works/{wid}/fundings", "RETRY_COOLDOWN", json=body)
    clock.set_now(now + timedelta(days=31))
    later = now + timedelta(days=31)
    api.ok("creator", "post", f"/works/{wid}/fundings", json={**body, "open_at": later.isoformat(),
                                                             "close_at": (later + timedelta(days=7)).isoformat()})
