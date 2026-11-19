from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import admin, auth, broker, community, events, fundings, info, market, me, studio, wallet, works
from app.core.config import settings
from app.core.db import init_db
from app.core.errors import register_error_handlers
from app.schemas.common import ErrorResponse

TAGS = [
    {"name": "auth", "description": "로그인·본인인증 (개발용 모의)"},
    {"name": "works", "description": "작품·회차·숏츠·찜 (STEP 1)"},
    {"name": "community", "description": "댓글·작가 게시판·팬아트·주주 게시판·신고·차단"},
    {"name": "info", "description": "작가 프로필·공지(종목 공시)·약관"},
    {"name": "events", "description": "이용 데이터 수집 (찜·연독률·전환 분석 원천)"},
    {"name": "wallet", "description": "콘텐츠용 코인 / 투자용 예치금 (분리 관리)"},
    {"name": "fundings", "description": "펀딩 = 조각 청약 (STEP 2~3)"},
    {"name": "market", "description": "상장 종목 지정가 상대매매 (STEP 5, 모의)"},
    {"name": "me", "description": "내 증권·청약·배당·알림"},
    {"name": "studio", "description": "크리에이터 스튜디오(웹): 내 작품·펀딩·리워드 배송·정산"},
    {"name": "broker", "description": "증권사 연계 (B안: 읽기는 DIBS, 청약·계좌·보유는 증권사). DIBS 제안 연동 규격 + dev 모의 키움 서버"},
    {"name": "admin", "description": "운영: 심사·마감·발행·상장·매출·배당·입출금 (STEP 4·6)"},
]


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.env != "test":
        init_db()
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description=(
            "웹툰·웹소설 IP 크라우드펀딩 및 토큰증권 조각투자 플랫폼 DIBS 백엔드.\n\n"
            f"**현재 모드: {settings.trading_mode}** — 투자 기능은 기본 모의투자로 동작합니다.\n\n"
            "에러 응답 형식: `{\"error\": {\"code\": \"...\", \"message\": \"...\"}}`\n\n"
            "금액은 모두 원 단위 정수, 비율은 bps(1bps = 0.01%) 정수입니다."
        ),
        openapi_tags=TAGS,
        lifespan=lifespan,
        responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 403: {"model": ErrorResponse},
                   404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
    )
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
    register_error_handlers(app)
    for r in (auth.router, works.router, community.router, info.router, events.router, wallet.router, fundings.router, market.router,
              me.router, studio.router, admin.router, broker.router):
        app.include_router(r)

    @app.get("/health", tags=["auth"], summary="헬스체크")
    def health():
        return {"status": "ok", "mode": settings.trading_mode}

    return app


app = create_app()
