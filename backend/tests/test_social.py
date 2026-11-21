"""간편 로그인(모의 동의 화면)과 휴대폰 인증번호 로그인."""
import urllib.parse


def _q(url):
    return dict(urllib.parse.parse_qsl(urllib.parse.urlparse(url).query))


def test_kakao_mock_flow_creates_then_reuses_account(api):
    c = api.c
    st = c.get("/auth/social/kakao/start", params={"redirect_uri": "dibs://auth"}).json()
    assert st["mock"] is True and "/auth/social/kakao/mock?" in st["authorize_url"]
    state = _q(st["authorize_url"])["state"]
    page = c.get(f"/auth/social/kakao/mock?state={state}")
    assert page.status_code == 200 and "카카오로 DIBS 시작하기" in page.text

    r = c.get("/auth/social/kakao/callback", params={"state": state, "code": "mock:디비팬"}, follow_redirects=False)
    assert r.status_code == 302 and r.headers["location"].startswith("dibs://auth?")
    q = _q(r.headers["location"])
    assert q["is_new"] == "1" and q["provider"] == "kakao"
    me = c.get("/me", headers={"Authorization": f"Bearer {q['token']}"}).json()
    assert me["nickname"] == "디비팬" and me["level"] == "L1"

    # 같은 계정으로 다시 로그인하면 새로 가입하지 않는다
    r2 = c.post("/auth/social/kakao/token", json={"access_token": "mock:디비팬"}).json()
    assert r2["is_new"] is False and r2["user_id"] == me["id"]


def test_social_rejects_foreign_redirect_and_cancel(api):
    c = api.c
    assert c.get("/auth/social/kakao/start", params={"redirect_uri": "https://evil.example/cb"}).json()["error"]["code"] == "REDIRECT_NOT_ALLOWED"
    st = c.get("/auth/social/naver/start", params={"redirect_uri": "http://localhost:8081/auth"}).json()
    state = _q(st["authorize_url"])["state"]
    r = c.get("/auth/social/naver/callback", params={"state": state, "error": "cancelled"}, follow_redirects=False)
    assert r.headers["location"] == "http://localhost:8081/auth?error=cancelled"
    # 다른 제공자의 state 는 받지 않는다
    assert c.get("/auth/social/kakao/callback", params={"state": state, "code": "mock:x"}).json()["error"]["code"] == "INVALID_STATE"
    assert c.get("/auth/social/apple/start", params={"redirect_uri": "dibs://auth"}).status_code == 404


def test_phone_otp_login(api):
    c = api.c
    assert c.post("/auth/phone/request", json={"phone": "02-123"}).json()["error"]["code"] == "INVALID_PHONE"
    code = c.post("/auth/phone/request", json={"phone": "010-1234-5678"}).json()["dev_code"]
    assert len(code) == 6
    assert c.post("/auth/phone/request", json={"phone": "01012345678"}).json()["error"]["code"] == "OTP_TOO_SOON"
    wrong = "000000" if code != "000000" else "111111"
    assert c.post("/auth/phone/verify", json={"phone": "01012345678", "code": wrong}).json()["error"]["code"] == "OTP_MISMATCH"
    r = c.post("/auth/phone/verify", json={"phone": "010 1234 5678", "code": code}).json()
    assert r["is_new"] is True
    # 같은 인증번호는 한 번만
    assert c.post("/auth/phone/verify", json={"phone": "01012345678", "code": code}).json()["error"]["code"] == "OTP_EXPIRED"
