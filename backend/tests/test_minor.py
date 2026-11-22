"""발표 전 점검에서 나온 작은 수정들."""
import pytest

from app.core import clock
from tests.conftest import open_funding

pytestmark = pytest.mark.usefixtures("v5_policy")


def test_my_subscription_is_null_before_subscribing(api, published_work, now):
    api.login("a")
    f = open_funding(api, published_work["id"], now, target_units=100, max_units=250)
    assert api.ok("a", "get", f"/fundings/{f['id']}/subscriptions/me") is None


def test_fixed_clock_accepts_timezone_suffix():
    assert clock._parse_fixed("2027-03-02T09:00:00+09:00") == clock._parse_fixed("2027-03-02T09:00:00")
    assert clock._parse_fixed("2027-03-02T00:00:00Z").hour == 9  # UTC 0시 = KST 9시
    assert clock._parse_fixed(None) is None


def test_reader_trend_partial_history(api, published_work, now):
    """공개한 지 며칠 안 된 작품: 있는 날만 (최대 7일), 공개 뒤 아무도 안 본 날은 0, tracked_days 로 기간을 알린다."""
    from datetime import timedelta
    wid = published_work["id"]
    ep = api.ok(None, "get", f"/works/{wid}/episodes")[0]["id"]
    t = api.ok(None, "get", f"/works/{wid}/reader-trend")
    assert t["tracked_days"] == 0 and t["days"] == []  # 아직 아무도 안 봄

    def view(anon, days_ago):
        return {"event_type": "VIEW_START", "anon_id": anon, "work_id": wid, "episode_id": ep,
                "occurred_at": (now - timedelta(days=days_ago, hours=1)).isoformat()}

    api.ok(None, "post", "/events", json={"events": [view("a", 3), view("b", 3), view("a", 1)]})
    t = api.ok(None, "get", f"/works/{wid}/reader-trend")
    days = [d["readers"] for d in t["days"]]
    # 최대 7일, 지금부터 24시간씩. 3일 전 첫 열람 → 그 전 날은 빼고 4일치만 (2일 전은 아무도 안 봐서 0)
    assert days == [2, 0, 1, 0]
    assert t["days"][-1]["date"] == now.date().isoformat()
    assert t["tracked_days"] == 4 and t["reader_change_1w"] is None  # 직전 7일 0명
    assert [x["no"] for x in t["episode_funnel"]] == sorted(x["no"] for x in t["episode_funnel"])


def test_buy_seeds_with_deposit(api):
    """씨앗 묶음을 키움 예치금으로 결제: 예치금이 결제 금액만큼 줄고 씨앗이 들어온다. 7일 안 미사용이면 예치금으로 환불."""
    api.login("a")
    api.ok("a", "post", "/wallet/deposit/charge", json={"amount": 100_000})
    before = api.ok("a", "get", "/wallet")
    r = api.ok("a", "post", "/wallet/coin/packages/buy", json={"package_id": "seed30", "channel": "DEPOSIT"})
    after = api.ok("a", "get", "/wallet")
    assert before["deposit_available"] - after["deposit_available"] == r["paid_amount"] == 3000
    assert after["coin"] - before["coin"] == 3000
    lot = next(l for l in api.ok("a", "get", "/wallet/coin/lots") if l["source"] == "DEPOSIT")
    api.ok("a", "post", f"/wallet/coin/lots/{lot['id']}/refund")
    back = api.ok("a", "get", "/wallet")
    assert back["deposit_available"] == before["deposit_available"] and back["coin"] == before["coin"]
    api.login("admin", "ADMIN")
    lines = api.ok("admin", "get", "/admin/ledger/trial-balance")
    for mode in {line["mode"] for line in lines}:
        assert sum(line["balance"] for line in lines if line["mode"] == mode) == 0


def test_buy_seeds_with_deposit_insufficient(api):
    api.login("b")
    api.err("b", "post", "/wallet/coin/packages/buy", "INSUFFICIENT_BALANCE", json={"package_id": "seed10", "channel": "DEPOSIT"})


def test_buy_seeds_with_exact_deposit(api):
    """예치금이 결제 금액과 딱 같으면 결제되고 0원이 된다. 청약에 묶인 돈(deposit_locked)은 쓰지 않는다."""
    api.login("c")
    api.ok("c", "post", "/wallet/deposit/charge", json={"amount": 1000})
    api.ok("c", "post", "/wallet/coin/packages/buy", json={"package_id": "seed10", "channel": "DEPOSIT"})
    w = api.ok("c", "get", "/wallet")
    assert w["deposit_available"] == 0 and w["coin"] == 1000
    api.err("c", "post", "/wallet/coin/packages/buy", "INSUFFICIENT_BALANCE", json={"package_id": "seed10", "channel": "DEPOSIT"})
