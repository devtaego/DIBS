"""간편 로그인(카카오·네이버·구글)과 휴대폰 인증번호 로그인.

간편 로그인 흐름 (앱은 브라우저만 열고, 비밀키가 필요한 코드 교환은 서버가 한다)
1. 앱 → GET /auth/social/{provider}/start?redirect_uri=dibs://auth   → authorize_url
2. 앱이 authorize_url 을 인증 세션 브라우저로 연다 (카카오 동의 화면)
3. 카카오 → GET /auth/social/{provider}/callback?code=...&state=...   (서버가 code → 액세스 토큰 → 회원 정보)
4. 서버 → 302 redirect_uri?token=<DIBS 토큰>&is_new=1                (앱이 주소에서 토큰을 꺼내 저장)

- state 는 서명된 짧은 JWT(10분)라 서버에 따로 저장하지 않는다. redirect_uri 는 허용 목록에 있는 앱 주소만 받는다.
- 네이티브 SDK로 이미 액세스 토큰을 받은 경우는 POST /auth/social/{provider}/token 으로 바로 로그인한다.
- 키가 설정되지 않은 개발·시연 환경은 서버가 띄우는 모의 동의 화면으로 같은 흐름을 그대로 탄다 (모의 키움과 같은 방식).
"""
import hashlib
import html
import json
import secrets
import urllib.error
import urllib.parse
import urllib.request
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import clock
from app.core.config import settings
from app.core.db import get_db
from app.core.errors import DomainError, Forbidden, NotFound
from app.core.security import create_token
from app.models import PhoneOtp, SocialAccount, User

router = APIRouter(prefix="/auth", tags=["auth"])

PROVIDERS = {
    "kakao": {
        "name": "카카오",
        "authorize": "https://kauth.kakao.com/oauth/authorize",
        "token": "https://kauth.kakao.com/oauth/token",
        "me": "https://kapi.kakao.com/v2/user/me",
        "scope": "profile_nickname account_email",
    },
    "naver": {
        "name": "네이버",
        "authorize": "https://nid.naver.com/oauth2.0/authorize",
        "token": "https://nid.naver.com/oauth2.0/token",
        "me": "https://openapi.naver.com/v1/nid/me",
        "scope": "",
    },
    "google": {
        "name": "구글",
        "authorize": "https://accounts.google.com/o/oauth2/v2/auth",
        "token": "https://oauth2.googleapis.com/token",
        "me": "https://openidconnect.googleapis.com/v1/userinfo",
        "scope": "openid email profile",
    },
}


def _cfg(provider: str) -> dict:
    p = PROVIDERS.get(provider)
    if p is None:
        raise NotFound("PROVIDER_NOT_FOUND", "지원하지 않는 간편 로그인이에요")
    return p


def _keys(provider: str) -> tuple[str, str]:
    return getattr(settings, f"{provider}_client_id", ""), getattr(settings, f"{provider}_client_secret", "")


def is_mock(provider: str) -> bool:
    cid, _ = _keys(provider)
    if cid:
        return False
    if settings.env == "prod":
        raise Forbidden("SOCIAL_NOT_CONFIGURED", f"{PROVIDERS[provider]['name']} 로그인이 아직 설정되지 않았어요")
    return True


def _base(request: Request | None) -> str:
    if settings.public_base_url:
        return settings.public_base_url.rstrip("/")
    return str(request.base_url).rstrip("/") if request is not None else "http://localhost:8000"


def _callback_url(provider: str, request: Request | None = None) -> str:
    return f"{_base(request)}/auth/social/{provider}/callback"


def _check_redirect(uri: str) -> str:
    if not any(uri.startswith(p) for p in settings.app_redirect_prefixes):
        raise DomainError("REDIRECT_NOT_ALLOWED", "허용되지 않은 돌아갈 주소예요", 400)
    return uri


def _state(provider: str, redirect_uri: str) -> str:
    return jwt.encode({"p": provider, "r": redirect_uri, "n": secrets.token_urlsafe(8),
                       "exp": datetime.now(UTC) + timedelta(minutes=10)}, settings.jwt_secret, algorithm=settings.jwt_alg)


def _read_state(provider: str, state: str) -> str:
    try:
        d = jwt.decode(state, settings.jwt_secret, algorithms=[settings.jwt_alg])
    except jwt.PyJWTError:
        raise DomainError("INVALID_STATE", "로그인 시간이 지났어요. 다시 시도해 주세요", 400) from None
    if d.get("p") != provider:
        raise DomainError("INVALID_STATE", "로그인 요청이 맞지 않아요", 400)
    return _check_redirect(d["r"])


def _http(url: str, data: dict | None = None, token: str | None = None) -> dict:
    req = urllib.request.Request(url, data=urllib.parse.urlencode(data).encode() if data is not None else None,
                                 headers={"Accept": "application/json",
                                          **({"Authorization": f"Bearer {token}"} if token else {}),
                                          **({"Content-Type": "application/x-www-form-urlencoded"} if data is not None else {})})
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            return json.loads(r.read() or b"{}")
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError):
        raise DomainError("SOCIAL_PROVIDER_ERROR", "간편 로그인 서버와 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요", 502) from None


def _profile(provider: str, access_token: str) -> dict:
    """제공자 회원 정보 → {id, email, nickname}"""
    if access_token.startswith("mock:"):
        if not is_mock(provider):
            raise DomainError("INVALID_SOCIAL_TOKEN", "간편 로그인 정보를 확인하지 못했어요", 401)
        nick = access_token[5:].strip()[:20] or f"{PROVIDERS[provider]['name']}회원"
        return {"id": "mock-" + hashlib.sha256(nick.encode()).hexdigest()[:16], "email": None, "nickname": nick}
    d = _http(PROVIDERS[provider]["me"], token=access_token)
    if provider == "kakao":
        acc = d.get("kakao_account") or {}
        uid, email, nick = d.get("id"), acc.get("email"), (acc.get("profile") or {}).get("nickname") or (d.get("properties") or {}).get("nickname")
    elif provider == "naver":
        r = d.get("response") or {}
        uid, email, nick = r.get("id"), r.get("email"), r.get("nickname") or r.get("name")
    else:
        uid, email, nick = d.get("sub"), d.get("email") if d.get("email_verified", True) else None, d.get("name")
    if not uid:
        raise DomainError("INVALID_SOCIAL_TOKEN", "간편 로그인 정보를 확인하지 못했어요", 401)
    return {"id": str(uid), "email": email, "nickname": (nick or f"{PROVIDERS[provider]['name']}회원")[:20]}


def _exchange(provider: str, code: str, request: Request | None = None) -> str:
    """인가 코드 → 제공자 액세스 토큰"""
    if code.startswith("mock:"):
        return code  # 모의 동의 화면에서 온 코드는 그대로 모의 토큰으로 쓴다
    cid, secret = _keys(provider)
    data = {"grant_type": "authorization_code", "client_id": cid, "redirect_uri": _callback_url(provider, request), "code": code}
    if secret:
        data["client_secret"] = secret
    d = _http(PROVIDERS[provider]["token"], data=data)
    if not d.get("access_token"):
        raise DomainError("SOCIAL_TOKEN_FAILED", "간편 로그인을 마치지 못했어요. 다시 시도해 주세요", 401)
    return d["access_token"]


def login_social(db: Session, provider: str, prof: dict) -> tuple[User, bool]:
    link = db.scalar(select(SocialAccount).where(SocialAccount.provider == provider,
                                                 SocialAccount.provider_user_id == prof["id"]))
    if link:
        return db.get(User, link.user_id), False
    email = prof.get("email")
    if not email or db.scalar(select(User.id).where(User.email == email)):
        # 같은 이메일의 기존 회원에 자동으로 붙이지 않는다 (남의 계정 탈취 방지). 연결은 로그인 뒤 설정에서
        email = f"{provider}_{prof['id']}@social.dibs"
    user = User(email=email, nickname=prof["nickname"])
    db.add(user)
    db.flush()
    db.add(SocialAccount(user_id=user.id, provider=provider, provider_user_id=prof["id"], email=prof.get("email")))
    db.flush()
    return user, True


class SocialStartOut(BaseModel):
    provider: str
    authorize_url: str
    mock: bool = Field(description="키가 없어 모의 동의 화면을 쓰는지")


class SocialTokenIn(BaseModel):
    access_token: str = Field(description="제공자 SDK가 준 액세스 토큰 (모의: 'mock:닉네임')")


class LoginOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    is_new: bool = Field(description="이번에 새로 가입했는지 (가입 완료 화면을 보여 줄지)")


@router.get("/social/providers", summary="간편 로그인 목록 (설정 여부)")
def providers():
    return [{"provider": k, "name": v["name"], "mock": not _keys(k)[0]} for k, v in PROVIDERS.items()]


@router.get("/social/{provider}/start", response_model=SocialStartOut, summary="간편 로그인 시작 (동의 화면 주소)")
def social_start(request: Request, provider: str,
                 redirect_uri: str = Query(description="로그인 뒤 돌아갈 앱 주소 (예: dibs://auth)")):
    p = _cfg(provider)
    state = _state(provider, _check_redirect(redirect_uri))
    if is_mock(provider):
        url = f"{_base(request)}/auth/social/{provider}/mock?" + urllib.parse.urlencode({"state": state})
        return SocialStartOut(provider=provider, authorize_url=url, mock=True)
    q = {"response_type": "code", "client_id": _keys(provider)[0], "redirect_uri": _callback_url(provider, request), "state": state}
    if p["scope"]:
        q["scope"] = p["scope"]
    return SocialStartOut(provider=provider, authorize_url=f"{p['authorize']}?{urllib.parse.urlencode(q)}", mock=False)


@router.get("/social/{provider}/callback", summary="간편 로그인 콜백 (제공자 → 서버 → 앱으로 돌려보냄)")
def social_callback(request: Request, provider: str, state: str, code: str | None = None, error: str | None = None,
                    db: Session = Depends(get_db)):
    _cfg(provider)
    redirect = _read_state(provider, state)
    sep = "&" if "?" in redirect else "?"
    if error or not code:
        return RedirectResponse(f"{redirect}{sep}error={urllib.parse.quote(error or 'cancelled')}", status_code=302)
    user, new = login_social(db, provider, _profile(provider, _exchange(provider, code, request)))
    db.commit()
    q = urllib.parse.urlencode({"token": create_token(user), "is_new": int(new), "provider": provider})
    return RedirectResponse(f"{redirect}{sep}{q}", status_code=302)


@router.post("/social/{provider}/token", response_model=LoginOut, summary="간편 로그인 (네이티브 SDK 액세스 토큰)")
def social_token(provider: str, body: SocialTokenIn, db: Session = Depends(get_db)):
    _cfg(provider)
    user, new = login_social(db, provider, _profile(provider, body.access_token))
    return LoginOut(access_token=create_token(user), user_id=user.id, is_new=new)


@router.get("/social/{provider}/mock", response_class=HTMLResponse, summary="[모의] 간편 로그인 동의 화면 (키가 없을 때)")
def social_mock(provider: str, state: str):
    p = _cfg(provider)
    if not is_mock(provider):
        raise NotFound("NOT_MOCK", "실제 간편 로그인이 설정돼 있어요")
    _read_state(provider, state)
    tone = {"kakao": ("#FEE500", "#191919"), "naver": ("#03C75A", "#FFFFFF"), "google": ("#FFFFFF", "#1F1F1F")}[provider]
    cb = f"/auth/social/{provider}/callback"
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{p['name']} 로그인 (모의)</title>
<style>body{{margin:0;font-family:-apple-system,'Pretendard',sans-serif;background:#F4F5F7;color:#191F28;display:flex;min-height:100vh;align-items:center;justify-content:center}}
.c{{width:min(360px,92vw);background:#fff;border-radius:20px;padding:28px 22px;box-shadow:0 10px 30px rgba(25,31,40,.08)}}
h1{{font-size:20px;margin:0 0 6px}}p{{color:#6B7684;font-size:14px;margin:0 0 18px;line-height:1.5}}
label{{font-size:13px;color:#4E5968}}input{{width:100%;box-sizing:border-box;height:48px;border-radius:12px;border:1px solid #E2E5E9;padding:0 14px;font-size:16px;margin:6px 0 16px}}
button{{width:100%;height:52px;border:0;border-radius:12px;font-size:16px;font-weight:700;background:{tone[0]};color:{tone[1]};box-shadow:inset 0 0 0 1px rgba(0,0,0,.06)}}
a{{display:block;text-align:center;margin-top:14px;color:#8B95A1;font-size:14px}}.m{{display:inline-block;font-size:11px;font-weight:700;color:#C4426F;background:#FBD9E3;border-radius:6px;padding:2px 6px;margin-bottom:10px}}</style></head>
<body><form class="c" method="get" action="{cb}"><span class="m">개발용 모의 화면</span>
<h1>{p['name']}로 DIBS 시작하기</h1><p>실제 {p['name']} 키가 설정되면 이 화면 대신 {p['name']} 동의 화면이 열려요.</p>
<input type="hidden" name="state" value="{html.escape(state)}"><input type="hidden" name="code" id="code">
<label for="nick">닉네임</label><input id="nick" value="{p['name']}회원" maxlength="20" autofocus>
<button type="submit" onclick="document.getElementById('code').value='mock:'+document.getElementById('nick').value">동의하고 계속하기</button>
<a href="{cb}?state={urllib.parse.quote(state)}&error=cancelled">취소</a></form></body></html>"""


# ── 휴대폰 인증번호 로그인 ──

def _norm_phone(phone: str) -> str:
    digits = "".join(c for c in phone if c.isdigit())
    if not (digits.startswith("01") and len(digits) in (10, 11)):
        raise DomainError("INVALID_PHONE", "휴대폰 번호를 다시 확인해 주세요", 422)
    return digits


def _hash(phone: str, code: str) -> str:
    return hashlib.sha256(f"{settings.jwt_secret}:{phone}:{code}".encode()).hexdigest()


class PhoneIn(BaseModel):
    phone: str = Field(examples=["010-1234-5678"])


class PhoneVerifyIn(PhoneIn):
    code: str = Field(min_length=6, max_length=6, examples=["123456"])


class OtpOut(BaseModel):
    expires_in: int = Field(description="인증번호 유효 시간(초)")
    dev_code: str | None = Field(default=None, description="개발·시연 환경에서만: 문자 대신 화면에 보여 줄 인증번호")


@router.post("/phone/request", response_model=OtpOut, summary="휴대폰 인증번호 받기")
def phone_request(body: PhoneIn, db: Session = Depends(get_db)):
    phone = _norm_phone(body.phone)
    recent = db.scalar(select(PhoneOtp).where(PhoneOtp.phone == phone).order_by(PhoneOtp.id.desc()))
    if recent and clock.now() < recent.created_at + timedelta(seconds=30):
        raise DomainError("OTP_TOO_SOON", "30초 뒤에 다시 받을 수 있어요", 429)
    code = f"{secrets.randbelow(1_000_000):06d}"
    db.add(PhoneOtp(phone=phone, code_hash=_hash(phone, code), expires_at=clock.now() + timedelta(seconds=settings.otp_ttl_seconds)))
    # 실서비스: 문자 발송 대행사로 보낸다 (SmsSender 어댑터). 개발·시연은 응답에 인증번호를 함께 준다
    return OtpOut(expires_in=settings.otp_ttl_seconds, dev_code=None if settings.env == "prod" else code)


@router.post("/phone/verify", response_model=LoginOut, summary="휴대폰 인증번호 확인 → 로그인 (처음이면 가입)")
def phone_verify(body: PhoneVerifyIn, db: Session = Depends(get_db)):
    phone = _norm_phone(body.phone)
    otp = db.scalar(select(PhoneOtp).where(PhoneOtp.phone == phone, PhoneOtp.used.is_(False)).order_by(PhoneOtp.id.desc()))
    if otp is None or clock.now() > otp.expires_at:
        raise DomainError("OTP_EXPIRED", "인증번호 시간이 지났어요. 다시 받아 주세요", 400)
    if otp.attempts >= settings.otp_max_attempts:
        raise DomainError("OTP_LOCKED", "5번 틀렸어요. 인증번호를 다시 받아 주세요", 400)
    if otp.code_hash != _hash(phone, body.code):
        otp.attempts += 1
        db.commit()
        raise DomainError("OTP_MISMATCH", f"인증번호가 맞지 않아요 ({otp.attempts}/{settings.otp_max_attempts})", 400)
    otp.used = True
    user = db.scalar(select(User).where(User.phone == phone))
    new = user is None
    if new:
        user = User(email=f"phone_{phone}@phone.dibs", nickname=f"회원{phone[-4:]}", phone=phone)
        db.add(user)
        db.flush()
    return LoginOut(access_token=create_token(user), user_id=user.id, is_new=new)
