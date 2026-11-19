"""시간 소스.

모든 시각은 KST 기준 naive datetime 으로 저장한다(국내 전용 서비스).
테스트에서는 set_now() 로 시간을 고정해 마감·점검·자정 취소를 검증한다.
"""
from datetime import datetime
from zoneinfo import ZoneInfo

KST = ZoneInfo("Asia/Seoul")
_fixed: datetime | None = None


def now() -> datetime:
    if _fixed is not None:
        return _fixed
    return datetime.now(KST).replace(tzinfo=None, microsecond=0)


def set_now(value: datetime | None) -> None:
    global _fixed
    _fixed = value
