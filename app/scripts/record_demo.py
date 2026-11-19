"""정적 데모 배포용 응답 녹화.

시연 데이터베이스로 백엔드를 띄운 뒤 실행하면, 앱이 부르는 GET 응답을 src/lib/demo-fixtures.json 에 저장한다.
    DIBS_DATABASE_URL=sqlite:////tmp/demo.db python -m scripts.seed_demo   (backend 폴더)
    DIBS_DATABASE_URL=sqlite:////tmp/demo.db uvicorn app.main:app --port 8000
    python scripts/record_demo.py                                          (app 폴더)
"""
import json
import pathlib
import urllib.parse
import urllib.request

BASE = "http://localhost:8000"
OUT = pathlib.Path(__file__).resolve().parent.parent / "src/lib/demo-fixtures.json"


def req(method, path, token=None, body=None):
    r = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                               headers={"content-type": "application/json", **({"Authorization": f"Bearer {token}"} if token else {})})
    try:
        with urllib.request.urlopen(r) as res:
            return json.loads(res.read() or b"null")
    except urllib.error.HTTPError:
        return None


def key(path, q=None):
    q = {k: v for k, v in (q or {}).items() if v is not None}
    return path + ("?" + "&".join(f"{k}={str(v).lower() if isinstance(v, bool) else v}" for k, v in sorted(q.items())) if q else "")


def main():
    tok = req("POST", "/auth/dev-login", body={"email": "reader1@dibs.dev"})["access_token"]
    fx = {}

    def get(path, q=None):
        url = path + ("?" + urllib.parse.urlencode({k: str(v).lower() if isinstance(v, bool) else v for k, v in (q or {}).items()}) if q else "")
        data = req("GET", url, tok)
        if data is not None:
            fx[key(path, q)] = data
        return data

    for p in ["/me", "/wallet", "/wallet/history", "/me/holdings", "/me/subscriptions", "/me/dividends", "/me/notifications",
              "/config/public", "/health", "/me/limits"]:
        get(p)
    get("/me/orders", {"open_only": True})
    get("/me/orders")
    get("/shorts/feed", {"limit": 50})
    for q in [{"limit": 100}, {"sort": "dibs", "limit": 60}, {"sort": "latest", "limit": 60}, {"sort": "dibs", "limit": 40}, {"sort": "latest", "limit": 40}]:
        get("/works", q)
    get("/fundings", {"status": "OPEN"})
    get("/fundings")
    works = get("/works", {"limit": 100}) or []
    for w in works:
        get(f"/works/{w['id']}")
        eps = get(f"/works/{w['id']}/episodes") or []
        for e in eps:
            get(f"/episodes/{e['id']}")
        get(f"/works/{w['id']}/shorts")
    fids = {w["funding_id"] for w in works if w.get("funding_id")}
    for fid in sorted(fids):
        for sub in ["", "/indicators", "/disclosure", "/serial", "/limits", "/breakeven", "/subscriptions/me", "/buyback-quote"]:
            get(f"/fundings/{fid}{sub}")
    get("/market/securities", {"sort": "latest"})
    secs = get("/market/securities", {"sort": "change"}) or []
    for s in secs:
        sid = s["funding_id"]
        get(f"/market/securities/{sid}")
        get(f"/market/securities/{sid}/orderbook")
        get(f"/market/securities/{sid}/trades", {"limit": 10})
        get(f"/market/securities/{sid}/dividends")
        for d in [14, 30]:
            get(f"/market/securities/{sid}/chart", {"days": d})
        for side in ["BUY", "SELL"]:
            px = s.get("last_price") or s["unit_price"]
            get(f"/market/securities/{sid}/order-preview", {"side": side, "price": px, "units": 1})
    OUT.write_text(json.dumps(fx, ensure_ascii=False))
    print(f"{len(fx)}개 응답 → {OUT}")


if __name__ == "__main__":
    main()
