"""연재 위험 규칙: 약정 회차 자동 지급·조기 완결·지연(태업)·귀책 중단·유보금·반환 청구·증권사 경로."""
from datetime import timedelta

from app.core import clock
from app.services import broker
from tests.conftest import iso
from tests.test_flow import assert_books_balance

SUB = {"agree_risk_notice": True, "agree_termination_rule": True}


def listed(api, wid, now, units_by_user: dict, terms: dict | None = None) -> int:
    f = api.ok("creator", "post", f"/works/{wid}/fundings", json={
        "target_units": 100, "open_at": iso(now), "close_at": iso(now + timedelta(days=7)), "use_of_funds": "작화"})
    api.ok("admin", "post", f"/admin/fundings/{f['id']}/review",
           json={"approve": True, "terms": {"committed_episodes": 20, **(terms or {})}})
    api.ok("admin", "post", f"/admin/fundings/{f['id']}/open")
    for who, units in units_by_user.items():
        api.ok(who, "post", f"/fundings/{f['id']}/subscriptions", json={**SUB, "units": units})
    api.ok("admin", "post", f"/admin/fundings/{f['id']}/close", params={"force": True})
    api.ok("admin", "post", f"/admin/fundings/{f['id']}/issuance", json={})
    for step, extra in [("FILED", {}), ("ISSUED", {"security_code": "KRDIBS1", "trustee": "T"}),
                        ("LISTING_SCHEDULED", {"listing_date": "2027-03-03"}), ("LISTED", {})]:
        api.ok("admin", "post", f"/admin/fundings/{f['id']}/issuance/advance", json={"step": step, **extra})
    return f["id"]


def publish(api, wid, start: int, count: int) -> None:
    for no in range(start, start + count):
        api.ok("creator", "post", f"/works/{wid}/episodes", json={"no": no, "title": f"{no}화", "content_url": "s3://x"})


def deposit(api, who) -> int:
    return api.ok(who, "get", "/wallet")["deposit_available"]


def setup_users(api):
    for u in ("a", "b"):
        api.login(u)
        api.ok(u, "post", "/wallet/deposit/charge", json={"amount": 2_000_000})


def test_buffer_rule_when_enforced(api, published_work, now, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "enforce_buffer", True)
    f = api.ok("creator", "post", f"/works/{published_work['id']}/fundings", json={
        "target_units": 100, "open_at": iso(now), "close_at": iso(now + timedelta(days=7)), "use_of_funds": "작화"})
    url = f"/admin/fundings/{f['id']}/review"
    api.err("admin", "post", url, "BUFFER_SHORT", json={"approve": True, "terms": {"committed_episodes": 20}})
    api.err("admin", "post", url, "INVALID_TERMS", json={"approve": True, "terms": {"committed_episodes": 12}})
    api.ok("admin", "post", url, json={"approve": True, "terms": {"committed_episodes": 20, "buffer_episodes": 5}})


def test_milestones_paid_automatically_by_episodes(api, published_work, now):
    setup_users(api)
    wid = published_work["id"]
    fid = listed(api, wid, now, {"a": 75, "b": 25})
    pays = api.ok("admin", "get", f"/admin/fundings/{fid}/payouts")
    assert [p["episodes_required"] for p in pays] == [None, 10, 20]
    api.err("admin", "post", f"/admin/fundings/{fid}/payouts/2/pay", "EPISODES_NOT_REACHED")
    assert deposit(api, "creator") == 340_000

    publish(api, wid, 5, 10)  # 시즌 10화 → 약정 절반
    assert deposit(api, "creator") == 340_000 + 255_000
    s = api.ok(None, "get", f"/fundings/{fid}/serial")
    assert (s["published"], s["state"], s["next_payout_at_episode"]) == (10, "ON_TRACK", 20)

    publish(api, wid, 15, 10)  # 약정 20화 → 마지막 지급 + 시즌 완결
    assert deposit(api, "creator") == 850_000
    assert api.ok(None, "get", f"/fundings/{fid}/serial")["state"] == "COMPLETED"
    assert_books_balance(api)


def test_early_completion_reduces_final_payout(api, published_work, now):
    setup_users(api)
    wid = published_work["id"]
    fid = listed(api, wid, now, {"a": 75, "b": 25})
    publish(api, wid, 5, 10)
    b0 = deposit(api, "b")
    out = api.ok("admin", "post", f"/admin/fundings/{fid}/complete")  # 20화 약정인데 10화에서 완결
    assert (out["early"], out["paid_to_creator"], out["distributed_to_holders"]) == (True, 127_500, 127_500)
    assert deposit(api, "creator") == 340_000 + 255_000 + 127_500
    assert deposit(api, "b") == b0 + 31_875
    s = api.ok(None, "get", f"/fundings/{fid}/serial")
    assert s["state"] == "EARLY_COMPLETED"
    assert [(d["kind"], d["amount"]) for d in s["special_distributions"]] == [("EARLY_COMPLETION", 127_500)]
    # 권리 종료: 완결 후 12개월보다 상장 후 24개월이 늦으므로 24개월까지 유지
    assert api.ok(None, "get", f"/fundings/{fid}/buyback-quote")["terminate_due_at"].startswith("2029-03-0")
    assert_books_balance(api)


def test_delay_warning_hiatus_and_breach_fault(api, published_work, now):
    setup_users(api)
    wid = published_work["id"]
    fid = listed(api, wid, now, {"a": 75, "b": 25})
    listed_at = clock.now()

    clock.set_now(listed_at + timedelta(days=35))  # 기대 4화, 연재 0화 → 한 달치 지연
    r = api.ok("admin", "post", f"/admin/fundings/{fid}/serial-check")
    assert (r["state"], r["delay_episodes"], r["action"]) == ("WARNING", 4, "WARNED")
    assert api.ok("b", "get", "/me/notifications")[0]["type"] == "SERIAL_DELAY"

    h = api.ok("admin", "post", f"/admin/fundings/{fid}/hiatus", json={"weeks": 4, "reason": "건강 회복"})
    assert (h["state"], h["over_limit_weeks"]) == ("ON_TRACK", 0)
    h = api.ok("admin", "post", f"/admin/fundings/{fid}/hiatus", json={"weeks": 6, "reason": "추가 휴재"})
    assert h["over_limit_weeks"] == 2 and h["hiatus_weeks_used"] == 10  # 8주 넘은 2주는 기한에서 안 빼 줌

    clock.set_now(listed_at + timedelta(days=147))  # (147 − 56)일 → 기대 12화, 연재 0화 → 석 달치 지연
    b0 = deposit(api, "b")
    r = api.ok("admin", "post", f"/admin/fundings/{fid}/serial-check")
    assert (r["action"], r["state"], r["discontinue_kind"]) == ("DISCONTINUED", "DISCONTINUED", "FAULT")
    assert (r["clawback_due"], r["clawback_outstanding"]) == (170_000, 170_000)  # 받은 34만 원의 50%
    assert deposit(api, "b") == b0 + 127_500  # 남은 지급분 51만 원 × 25%
    assert api.ok(None, "get", f"/fundings/{fid}")["status"] == "SUSPENDED"

    # 귀책 중단 뒤 매출: 반환 청구액을 채울 때까지 작가 몫은 투자자에게
    period = {"period": "2027Q3"}
    api.ok("admin", "post", "/admin/revenues", json={"funding_id": fid, **period, "source": "AD", "gross": 100_000})
    run = api.ok("admin", "post", f"/admin/fundings/{fid}/dividends", params={"force": True}, json=period)
    assert (run["holder_pool"], run["creator_amount"], run["clawback_applied"], run["creator_escrow"]) == \
        (75_000, 0, 30_000, 0)
    out = api.ok("admin", "post", f"/admin/fundings/{fid}/clawback", json={"amount": 140_000})
    assert out["clawback_outstanding"] == 0
    api.err("admin", "post", f"/admin/fundings/{fid}/clawback", "NO_CLAWBACK", json={"amount": 1})
    assert_books_balance(api)


def test_escrow_released_on_termination_or_forfeited_on_fault(api, published_work, now):
    setup_users(api)
    wid = published_work["id"]
    fid = listed(api, wid, now, {"a": 75, "b": 25})
    period = {"period": "2027Q2"}
    api.ok("admin", "post", "/admin/revenues", json={"funding_id": fid, **period, "source": "AD", "gross": 100_000})
    run = api.ok("admin", "post", f"/admin/fundings/{fid}/dividends", params={"force": True}, json=period)
    assert (run["creator_amount"], run["creator_escrow"]) == (30_000, 15_000)
    api.ok("admin", "post", f"/admin/dividends/{run['id']}/pay", params={"force": True})
    assert deposit(api, "creator") == 340_000 + 15_000
    assert api.ok(None, "get", f"/fundings/{fid}/serial")["creator_escrow_balance"] == 15_000

    a0 = deposit(api, "a")
    out = api.ok("admin", "post", f"/admin/fundings/{fid}/discontinue", json={"reason": "표절 확인", "kind": "FAULT"})
    assert (out["escrow_forfeited"], out["clawback_due"], out["clawback_outstanding"]) == (15_000, 170_000, 155_000)
    assert deposit(api, "a") == a0 + 382_500 + 11_250  # 남은 지급분 75% + 유보금 75%
    assert_books_balance(api)


def test_escrow_released_to_creator_on_normal_termination(api, published_work, now):
    setup_users(api)
    fid = listed(api, published_work["id"], now, {"a": 100})
    period = {"period": "2027Q2"}
    api.ok("admin", "post", "/admin/revenues", json={"funding_id": fid, **period, "source": "AD", "gross": 100_000})
    run = api.ok("admin", "post", f"/admin/fundings/{fid}/dividends", params={"force": True}, json=period)
    api.ok("admin", "post", f"/admin/dividends/{run['id']}/pay", params={"force": True})
    before = deposit(api, "creator")
    api.ok("admin", "post", f"/admin/fundings/{fid}/discontinue", json={"reason": "건강 악화", "kind": "NO_FAULT"})
    api.ok("admin", "post", f"/admin/fundings/{fid}/terminate", params={"force": True})
    assert deposit(api, "creator") == before + 15_000  # 불가피한 중단: 유보금은 종료 때 작가에게
    assert_books_balance(api)


def test_broker_mode_special_distribution_and_notices(api, published_work, now, monkeypatch):
    from app.core.config import settings

    setup_users(api)
    fid = listed(api, published_work["id"], now, {"a": 75, "b": 25})
    monkeypatch.setattr(settings, "subscription_channel", "BROKER")
    b0 = deposit(api, "b")
    api.ok("admin", "post", f"/admin/fundings/{fid}/discontinue", json={"reason": "작가 건강", "kind": "NO_FAULT"})
    assert deposit(api, "b") == b0  # 증권사 지급 전에는 DIBS가 돈을 보내지 않는다

    path = "/broker/notices?after_id=0"
    n = api.c.get(path, headers={"X-Broker-Signature": broker.sign(f"GET {path}".encode())}).json()
    kinds = [i["kind"] for i in n["items"]]
    assert "SPECIAL_DISTRIBUTION" in kinds and "DISCONTINUED" in kinds
    sid = next(i["payload"]["special_id"] for i in n["items"] if i["kind"] == "SPECIAL_DISTRIBUTION")
    p2 = f"/broker/special-distributions/{sid}/instruction"
    ins = api.c.get(p2, headers={"X-Broker-Signature": broker.sign(f"GET {p2}".encode())}).json()
    assert (ins["status"], ins["total"], ins["unlinked"]["count"]) == ("INSTRUCTED", 510_000, 2)
    assert api.c.get(p2).status_code == 403

    done = api.ok(None, "post", f"/dev/mock-kiwoom/special-distributions/{sid}/pay")
    assert done["matched"] is True
    assert deposit(api, "b") == b0 + 127_500
    assert_books_balance(api)
