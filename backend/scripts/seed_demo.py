"""시연·프런트 개발용 데모 데이터.

    python -m scripts.seed_demo            # ./dibs.db 에 생성
    DIBS_DATABASE_URL=sqlite:///./demo.db python -m scripts.seed_demo

만들어지는 것
- 작품 A 「악녀인데 남주들이 나를 숭배한다」: 펀딩 모집 중, 목표 1,000조각(1,000만 원)에 8,420조각 청약 (842%)
- 작품 B 「검을 거둔 아이」: 펀딩 성공(균등 20% + 비례 배정) → 상장, 마켓 체결·호가·주주 게시판 글 있음
- 계정: admin@ / creator@ / reader1~30@dibs.dev  (POST /auth/dev-login 으로 토큰 발급)
  reader30 은 아무것도 청약하지 않은 계정 → 시연에서 새로 청약해 보기용
"""
from datetime import timedelta

from fastapi.testclient import TestClient

from app.core import clock
from app.main import app

SUB = {"agree_risk_notice": True, "agree_no_principal_return": True}


def main() -> None:
    with TestClient(app) as c:
        tok: dict[str, str] = {}

        def login(name: str, role: str = "READER") -> None:
            r = c.post("/auth/dev-login", json={"email": f"{name}@dibs.dev", "role": role})
            tok[name] = r.json()["access_token"]
            call(name, "post", "/auth/kyc/mock")
            call(name, "post", "/me/risk-profile", json={"answers": [3, 3, 3, 3, 3]})

        def call(who: str, method: str, url: str, **kw):
            r = getattr(c, method)(url, headers={"Authorization": f"Bearer {tok[who]}"}, **kw)
            if r.status_code >= 400:
                raise SystemExit(f"{method.upper()} {url} 실패: {r.status_code} {r.text}")
            return r.json()

        login("admin", "ADMIN")
        login("creator", "CREATOR")
        readers = [f"reader{i}" for i in range(1, 31)]
        for r in readers:
            login(r)
            call(r, "post", "/wallet/deposit/charge", json={"amount": 5_000_000})
            call(r, "post", "/wallet/coin/charge", json={"amount": 5_000})

        def make_work(title: str, genre: str, n_eps: int) -> int:
            w = call("creator", "post", "/works", json={"title": title, "type": "WEBTOON", "genre": genre,
                                                        "synopsis": f"{title} (데모)", "rights_declared": True})
            for i in range(1, n_eps + 1):
                call("creator", "post", f"/works/{w['id']}/episodes",
                     json={"no": i, "title": f"{i}화", "content_url": f"https://cdn.example/{w['id']}/{i}"})
            call("creator", "post", f"/works/{w['id']}/shorts",
                 json={"title": f"{title} 1분 티저", "video_url": f"https://cdn.example/{w['id']}/short.mp4",
                       "duration_sec": 58})
            call("creator", "post", f"/works/{w['id']}/submit")
            call("admin", "post", f"/admin/works/{w['id']}/review", json={"approve": True})
            return w["id"]

        def make_funding(work_id: int, target: int, tiers: list) -> int:
            now = clock.now()
            f = call("creator", "post", f"/works/{work_id}/fundings", json={
                "target_units": target, "open_at": now.isoformat(), "close_at": (now + timedelta(days=14)).isoformat(),
                "use_of_funds": "작화 외주 60% · 편집 20% · 마케팅 20%", "reward_tiers": tiers})
            call("admin", "post", f"/admin/fundings/{f['id']}/review",
                 json={"approve": True, "terms": {"max_units_per_user": 300}})  # 배정·지급은 v3.0 기본값
            call("admin", "post", f"/admin/fundings/{f['id']}/open")
            return f["id"]

        # 작품 A: 모집 중 842%
        a = make_work("악녀인데 남주들이 나를 숭배한다", "로맨스 판타지", 14)
        for r in readers[:3]:
            call(r, "put", f"/works/{a}/dib")
        call("creator", "patch", "/me", json={"bio": "로맨스 판타지를 그리는 신인 작가"})
        fa = make_funding(a, 1000, [{"title": "에필로그 크레딧 등재", "min_units": 1},
                                    {"title": "한정판 양장본 + 넘버링 카드", "min_units": 30, "limited_qty": 50,
                                     "requires_shipping": True}])
        for i, r in enumerate(readers[:29]):  # 28명 × 300 + 20 = 8,420조각
            call(r, "post", f"/fundings/{fa}/subscriptions", json={**SUB, "units": 300 if i < 28 else 20})

        # 작품 B: 상장 + 거래
        b = make_work("검을 거둔 아이", "무협", 8)
        fb = make_funding(b, 1000, [])
        for r in readers[:12]:  # 12명 × 100 = 1,200조각 (120%)
            call(r, "post", f"/fundings/{fb}/subscriptions", json={**SUB, "units": 100})
        call("admin", "post", f"/admin/fundings/{fb}/close", params={"force": True})
        call("admin", "post", f"/admin/fundings/{fb}/issuance", json={"broker_name": "제휴증권(모의)"})
        for step, extra in [("FILED", {}), ("ISSUED", {"security_code": "KRDIBS0000002", "trustee": "모의신탁"}),
                            ("LISTING_SCHEDULED", {"listing_date": clock.now().date().isoformat()}), ("LISTED", {})]:
            call("admin", "post", f"/admin/fundings/{fb}/issuance/advance", json={"step": step, **extra})
        order = {"funding_id": fb, "agree_risk_notice": True}
        call("reader1", "post", "/market/orders", json={**order, "side": "SELL", "price": 11_500, "units": 10})
        call("reader2", "post", "/market/orders", json={**order, "side": "BUY", "price": 11_500, "units": 6})
        call("reader3", "post", "/market/orders", json={**order, "side": "SELL", "price": 12_000, "units": 5})
        call("reader4", "post", "/market/orders", json={**order, "side": "BUY", "price": 11_000, "units": 8})

        call("creator", "post", f"/works/{b}/posts", json={"kind": "BOARD", "body": "9화는 다음 주 화요일에 올라와요"})
        call("reader1", "post", f"/works/{b}/posts", json={"kind": "HOLDER_BOARD", "body": "첫 분기 배당 기대돼요"})
        call("admin", "post", "/admin/notices", json={"title": "매일 04:00~04:30 마켓 점검", "body": "점검 중에는 주문할 수 없어요.",
                                                     "category": "MAINTENANCE", "is_pinned": True})

        print(f"작품 A id={a}, 펀딩 id={fa} (모집 중)")
        print(f"작품 B id={b}, 종목 id={fb} (상장)")
        print("로그인: POST /auth/dev-login {\"email\": \"reader1@dibs.dev\"}")


if __name__ == "__main__":
    main()
