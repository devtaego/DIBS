from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import EventType, FundingStatus, WorkStatus, WorkType
from app.schemas.common import ORM


class WorkIn(BaseModel):
    title: str = Field(max_length=200)
    type: WorkType
    genre: str = Field(max_length=50, examples=["로맨스 판타지"])
    synopsis: str = ""
    cover_url: str | None = None
    age_rating: str = Field(default="ALL", pattern="^(ALL|15|19)$", description="연령 등급 (운영자가 심사 때 확정)")
    rights_declared: bool = Field(description="작품 공개 권한을 보유했음을 확인")
    prior_contract_note: str | None = Field(default=None, description="기존 연재·출판 계약 관계")


class WorkPatch(BaseModel):
    title: str | None = None
    age_rating: str | None = Field(default=None, pattern="^(ALL|15|19)$")
    genre: str | None = None
    synopsis: str | None = None
    cover_url: str | None = None


class WorkOut(ORM):
    id: int
    creator_id: int
    title: str
    type: WorkType
    genre: str
    synopsis: str
    cover_url: str | None
    status: WorkStatus
    age_rating: str = "ALL"
    created_at: datetime


class WorkDetailOut(WorkOut):
    dib_count: int
    is_dibbed: bool
    episode_count: int
    funding_id: int | None
    funding_status: FundingStatus | None
    reader_change_1w: float | None = Field(default=None, description="주간 독자 증가율 (펀딩 상세 '미리보기 반응 지표')")
    display_status: str = Field(default="PUBLISHED", description="기획서 3-1 작품 상태: PUBLISHED · FUNDING · FUNDING_FAILED · "
                                "ISSUING · LISTED · HALTED · DELISTED (작품 상태와 펀딩 상태를 합쳐 계산)")


class EpisodeIn(BaseModel):
    no: int = Field(ge=1)
    title: str
    content_url: str


class EpisodeOut(ORM):
    id: int
    work_id: int
    no: int
    title: str
    is_paid: bool = Field(description="지금 결제가 필요한 회차인가 (유료 미리보기 기간 중)")
    paid_preview: bool = Field(description="유료 미리보기로 지정된 회차")
    price_coin: int = Field(description="원 단위 가격")
    price_seeds: int = Field(default=0, description="화면 표기용 씨앗 개수 (price_coin ÷ 100)")
    free_unlock_at: datetime | None = Field(description="정식 공개 시각. 이때부터 무료")


class EpisodeContentOut(EpisodeOut):
    content_url: str


class EpisodeListItem(EpisodeOut):
    unlocked: bool


class EpisodePricingIn(BaseModel):
    is_paid: bool
    price_coin: int = Field(default=0, ge=0, description="원 단위 (300 = 씨앗 3개)")
    free_unlock_at: datetime | None = Field(default=None, description="정식 공개(무료 전환) 시각. 비우면 공개 21일 뒤")


class ShortIn(BaseModel):
    title: str
    video_url: str
    duration_sec: int = Field(gt=0, le=180, description="3분 이하 (하이라이트 1분 권장, 1화 모션웹툰 전편 허용)")


class ShortOut(ORM):
    id: int
    work_id: int
    title: str
    video_url: str
    duration_sec: int


class ShortFeedItem(ShortOut):
    work_title: str
    funding_id: int | None
    funding_status: FundingStatus | None


class ReviewIn(BaseModel):
    approve: bool
    note: str | None = None


# ── 이벤트 로깅 ──
class EventIn(BaseModel):
    event_type: EventType
    occurred_at: datetime
    anon_id: str | None = Field(default=None, description="비로그인 기기 식별자")
    session_id: str | None = None
    work_id: int | None = None
    episode_id: int | None = None
    short_id: int | None = None
    funding_id: int | None = None
    progress: float | None = Field(default=None, ge=0, le=1)
    props: dict = Field(default_factory=dict, examples=[{"platform": "ios", "app_version": "0.1.0"}])


class EventBatchIn(BaseModel):
    events: list[EventIn] = Field(min_length=1, max_length=100)


class EventBatchOut(BaseModel):
    accepted: int


class EpisodeMetric(BaseModel):
    episode_id: int
    no: int
    unique_starts: int
    unique_completes: int
    completion_rate: float | None
    read_through_rate: float | None = Field(description="1화 완독자 대비 이 회차 완독자 비율 (연독률)")


class DailyReadersOut(BaseModel):
    date: str = Field(description="YYYY-MM-DD (KST). 마지막 = 오늘")
    readers: int = Field(description="그 24시간 동안 회차를 연 순독자 (VIEW_START 고유 독자)")


class EpisodeFunnelOut(BaseModel):
    no: int
    starters: int = Field(description="이 회차를 연 순독자")
    completes: int = Field(description="이 회차를 끝까지 본 순독자")


class ReaderTrendOut(BaseModel):
    """펀딩 상세 차트용 독자 추이."""

    work_id: int
    days: list[DailyReadersOut] = Field(description="오늘까지 최대 7일 (오래된 날 → 오늘, 지금 시각부터 24시간씩). 공개 3일째면 3개")
    readers_last_7d: int
    readers_prev_7d: int
    reader_change_1w: float | None = Field(description="주간 독자 증가율 = (최근 7일 − 직전 7일) ÷ 직전 7일 (직전 0명이면 null)")
    tracked_days: int = Field(description="첫 열람부터 지금까지 24시간 구간 수 (0 = 데이터 없음). 14 이하면 직전 7일이 다 차지 않음")
    episode_funnel: list[EpisodeFunnelOut] = Field(description="무료 공개 회차별 시작·완독 독자")


class WorkMetricsOut(BaseModel):
    work_id: int
    readers_last_7d: int = Field(description="최근 7일 회차 뷰어(VIEW_START) 순독자")
    readers_prev_7d: int = Field(description="그 직전 7일 순독자")
    reader_change_1w: float | None = Field(description="주간 독자 증가율 = (최근 − 직전) ÷ 직전. 직전 0명이면 null")
    detail_views: int
    unique_readers: int
    dibs: int
    short_plays: int
    funding_cta_clicks: int
    episodes: list[EpisodeMetric]


class WorkCardOut(WorkOut):
    """홈·목록 카드용: 펀딩·상장 상태 배지까지 한 번에."""

    dib_count: int
    funding_id: int | None
    funding_status: FundingStatus | None


class WorkAdminOut(WorkOut):
    rights_declared: bool
    prior_contract_note: str | None
    review_note: str | None
    episode_count: int


class ReviewEpisodeMetric(BaseModel):
    no: int
    verified_completes: int
    verified_read_through_rate: float | None


class ReviewMetricsOut(BaseModel):
    """심사 지표: 본인인증 계정만 집계 + 조작 의심 신호."""

    work_id: int
    dibs_total: int
    dibs_verified: int
    dibs_without_read: int = Field(description="본인인증 계정 중 완독 기록 없이 찜만 한 수")
    dibs_from_new_accounts: int = Field(description="가입 24시간 안에 찜한 수")
    max_dibs_in_1h: int
    eligible_dibs: int = Field(description="심사에 반영하는 찜 = 본인인증 − 완독 없음 − 신규 계정")
    episodes: list[ReviewEpisodeMetric]
    flags: list[str] = Field(description="NO_READ_DIBS_HIGH · DIB_BURST · NEW_ACCOUNT_DIBS_HIGH")
