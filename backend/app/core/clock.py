"""시간 소스.

모든 시각은 KST 기준 naive datetime 으로 저장한다(국내 전용 서비스).
테스트에서는 set_now() 로 시간을 고정해 마감·점검·자정 취소를 검증한다.
"""
import os
from datetime import datetime
from zoneinfo import ZoneInfo

KST = ZoneInfo("Asia/Seoul")
# 시연용: DIBS_NOW=2027-03-02T09:00:00 처럼 주면 그 시각으로 고정 (조각투자 개정 시행 2027년 2월 이후 기준 시연)
_fixed: datetime | None = datetime.fromisoformat(os.environ["DIBS_NOW"]) if os.getenv("DIBS_NOW") else None


def now() -> datetime:
    if _fixed is not None:
        return _fixed
    return datetime.now(KST).replace(tzinfo=None, microsecond=0)


def set_now(value: datetime | None) -> None:
    global _fixed
    _fixed = value
