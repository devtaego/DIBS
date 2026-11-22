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
    """공개한 지 며칠 안 된 작품: 첫 열람 전 날은 null, 공개 뒤 아무도 안 본 날은 0, tracked_days 로 기간을 알린다."""
    from datetime import timedelta
    wid = published_work["id"]
    ep = api.ok(None, "get", f"/works/{wid}/episodes")[0]["id"]
    t = api.ok(None, "get", f"/works/{wid}/reader-trend")
    assert t["tracked_days"] == 0 and all(d["readers"] is None for d in t["days"]) and len(t["days"]) == 7

    def view(anon, days_ago):
        return {"event_type": "VIEW_START", "anon_id": anon, "work_id": wid, "episode_id": ep,
                "occurred_at": (now - timedelta(days=days_ago, hours=1)).isoformat()}

    api.ok(None, "post", "/events", json={"events": [view("a", 3), view("b", 3), view("a", 1)]})
    t = api.ok(None, "get", f"/works/{wid}/reader-trend")
    days = [d["readers"] for d in t["days"]]
    # 막대 7개 = 6일 전 … 오늘 (지금부터 24시간씩). 3일 전 첫 열람 → 그 전은 데이터 없음(null), 2일 전은 아무도 안 봄(0)
    assert days == [None, None, None, 2, 0, 1, 0]
    assert t["days"][-1]["date"] == now.date().isoformat()
    assert t["tracked_days"] == 4 and t["reader_change_1w"] is None  # 직전 7일 0명
    assert [x["no"] for x in t["episode_funnel"]] == sorted(x["no"] for x in t["episode_funnel"])
