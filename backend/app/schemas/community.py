from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import PostKind
from app.schemas.common import ORM
from app.schemas.content import WorkCardOut


class PostIn(BaseModel):
    kind: PostKind
    body: str = Field(min_length=1, max_length=2000)
    episode_id: int | None = Field(default=None, description="EPISODE_COMMENT 일 때 필수")
    short_id: int | None = Field(default=None, description="SHORT_COMMENT 일 때 필수")
    image_url: str | None = Field(default=None, description="FANART 일 때 필수")


class ReplyIn(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class PostOut(BaseModel):
    id: int
    kind: PostKind
    work_id: int
    episode_id: int | None
    short_id: int | None
    parent_id: int | None
    author_id: int
    author_nickname: str
    is_creator: bool = Field(description="작품 작가가 쓴 글 (작가 배지)")
    body: str
    image_url: str | None
    reply_count: int
    created_at: datetime


class ReportIn(BaseModel):
    reason: str = Field(pattern="^(ABUSE|SPAM|CREATIVE_PRESSURE|OTHER)$",
                        description="CREATIVE_PRESSURE = 투자자의 창작 개입·압박 (v3.0 커뮤니티 정책)")


class ReportOut(BaseModel):
    post_id: int
    report_count: int
    hidden: bool


class CreatorOut(BaseModel):
    id: int
    nickname: str
    bio: str
    avatar_url: str | None
    works: list[WorkCardOut]


class NoticeIn(BaseModel):
    title: str
    body: str
    category: str = Field(default="GENERAL", pattern="^(GENERAL|DISCLOSURE|MAINTENANCE)$")
    funding_id: int | None = None
    is_pinned: bool = False


class NoticeOut(ORM):
    id: int
    title: str
    body: str
    category: str
    funding_id: int | None
    is_pinned: bool
    created_at: datetime


class PolicyOut(BaseModel):
    key: str
    title: str
    version: str
    body: str
    required_for: list[str] = Field(description="이 문서 동의가 필요한 행동")
