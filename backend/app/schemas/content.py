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
    rights_declared: bool = Field(description="작품 공개 권한을 보유했음을 확인")
    prior_contract_note: str | None = Field(default=None, description="기존 연재·출판 계약 관계")


class WorkPatch(BaseModel):
    title: str | None = None
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
    created_at: datetime


class WorkDetailOut(WorkOut):
    dib_count: int
    is_dibbed: bool
    episode_count: int
    funding_id: int | None
    funding_status: FundingStatus | None


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
    price_coin: int
    free_unlock_at: datetime | None = Field(description="이 시각부터 무료 (공개 21일 후)")


class EpisodeContentOut(EpisodeOut):
    content_url: str


class EpisodeListItem(EpisodeOut):
    unlocked: bool


class EpisodePricingIn(BaseModel):
    is_paid: bool
    price_coin: int = Field(default=0, ge=0)


class ShortIn(BaseModel):
    title: str
    video_url: str
    duration_sec: int = Field(gt=0, le=60, description="1분 이하")


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


class WorkMetricsOut(BaseModel):
    work_id: int
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
