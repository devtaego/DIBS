"""공시와 정산 대사 (v5.0 이해상충 방지).

DIBS는 작품을 서비스하고 매출을 집계하며 그 매출의 25%를 받는다. 숫자를 만드는 쪽과 검증하는 쪽이 같아지지
않도록 세 가지 장치를 둔다.

1. 결제 시점 분할: 상장 작품의 유료 결제는 DIBS 매출 계정을 거치지 않고 신탁 계좌(SYS_TRUST_RECEIVABLE)로
   바로 들어간다 (content.unlock_episode). 실서비스에서는 PG 분할정산으로 신탁사 계좌에 입금된다.
2. 정산 기준 고정: 배당 재원 = 결제액 − 인앱결제 수수료. 열람 기록이 아니라 결제가 기준이라 조작할 여지가 없다.
3. 대사와 원장 해시 공시: 분기마다 결제 원천 합계 · 신탁 입금 합계 · 배당 재원 기록을 맞춰 보고,
   결제 기록의 SHA-256 연쇄 해시를 공시한다. 나중에 기록을 바꾸면 해시가 달라진다.
"""
import hashlib
from datetime import datetime, time, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Account, EpisodeUnlock, Funding, Posting, RevenueRecord
from app.models.enums import AccountKind, RevenueSource
from app.services import product
from app.services.dividend import parse_period


def _quarter(d: datetime) -> str:
    return f"{d.year}Q{(d.month - 1) // 3 + 1}"


def periods_since_listing(f: Funding, until: datetime) -> list[str]:
    if not f.listed_at:
        return []
    out, d = [], datetime(f.listed_at.year, f.listed_at.month, 1)
    while d <= until:
        q = _quarter(d)
        if q not in out:
            out.append(q)
        d = datetime(d.year + (d.month == 12), d.month % 12 + 1, 1)
    return out


def ledger_hash(unlocks: list[EpisodeUnlock]) -> str:
    """결제 기록 연쇄 해시. 회원 식별자는 넣지 않는다 (개인정보 없이 공시 가능)."""
    h = "0" * 64
    for u in unlocks:
        row = f"{h}|{u.id}|{u.episode_id}|{u.price_coin}|{u.unlocked_at.isoformat()}"
        h = hashlib.sha256(row.encode()).hexdigest()
    return h


def reconcile(db: Session, f: Funding, period: str) -> dict:
    start, end = parse_period(period)
    lo, hi = datetime.combine(start, time.min), datetime.combine(end + timedelta(days=1), time.min)
    unlocks = list(db.scalars(select(EpisodeUnlock).where(
        EpisodeUnlock.funding_id == f.id, EpisodeUnlock.unlocked_at >= lo, EpisodeUnlock.unlocked_at < hi)
        .order_by(EpisodeUnlock.id)))
    unlock_gross = sum(u.price_coin for u in unlocks)
    journal_ids = [u.journal_id for u in unlocks]
    trust_inflow = 0
    if journal_ids:
        trust_inflow = int(db.scalar(select(func.coalesce(func.sum(Posting.amount), 0))
                                     .join(Account, Account.id == Posting.account_id)
                                     .where(Posting.journal_id.in_(journal_ids),
                                            Account.kind == AccountKind.SYS_TRUST_RECEIVABLE)))
    # 상장 뒤인데 신탁 계좌를 거치지 않은 이 작품 결제 (누수 탐지)
    since = max(lo, f.listed_at) if f.listed_at else lo
    until = min(hi, f.terminated_at) if f.terminated_at else hi
    leaked = int(db.scalar(select(func.count()).where(
        EpisodeUnlock.work_id == f.work_id, EpisodeUnlock.funding_id.is_(None),
        EpisodeUnlock.unlocked_at >= since, EpisodeUnlock.unlocked_at < until)) or 0)
    rec = db.scalar(select(func.sum(RevenueRecord.gross)).where(
        RevenueRecord.funding_id == f.id, RevenueRecord.period == period,
        RevenueRecord.source == RevenueSource.PAID_EPISODE))
    recorded = int(rec) if rec is not None else None
    matched = unlock_gross == trust_inflow and leaked == 0 and (recorded is None or recorded == unlock_gross)
    return {"period": period, "unlock_gross": unlock_gross, "trust_inflow": trust_inflow,
            "recorded_gross": recorded, "leaked_unlocks": leaked, "matched": matched,
            "ledger_hash": ledger_hash(unlocks), "records": len(unlocks)}


def disclosure(db: Session, f: Funding, now: datetime) -> dict:
    return {
        "funding_id": f.id,
        "cost_per_100": {"creator": f.creator_bps / 100, "issuance_cost": f.issuance_cost_bps / 100,
                         "reserve": f.reserve_bps / 100, "dibs": f.platform_fee_bps / 100},
        "creator_token": {"bps": f.creator_token_bps, "lockup_months": f.creator_lockup_months},
        "revenue_split": {
            "before_recoup": {"holder": f.royalty_holder_bps / 100, "creator": f.royalty_creator_bps / 100,
                              "dibs": f.royalty_platform_bps / 100},
            "after_recoup": {"holder": f.royalty_holder_after_bps / 100, "creator": f.royalty_creator_after_bps / 100,
                             "dibs": f.royalty_platform_after_bps / 100},
            "recoup_rule": "원천징수 후 누적 분배금이 발행액에 닿은 분기의 다음 분기부터 회수 후 비율",
            "secondary_ip": {"holder": product.settings.royalty_secondary_holder_bps / 100,
                             "creator": product.settings.royalty_secondary_creator_bps / 100,
                             "dibs": product.settings.royalty_secondary_platform_bps / 100,
                             "sources": "판권 · 단행본 · 굿즈 · 캐릭터 · 해외 연재 (외부 직접비 공제 후)"},
        },
        "term": {"fixed_term": product.settings.fixed_term_enabled,  # v2.2: 고정 운용 기간·만기 없음
                 "season_months": product.settings.season_months if product.settings.fixed_term_enabled else None,
                 "after_completion_months": (product.settings.termination_after_completion_months
                                             if product.settings.fixed_term_enabled else None),
                 "principal_repayment": False},
        "per_user_cap_amount": product.per_user_cap_amount(f.target_amount),
        "buyback_enabled": f.buyback_enabled,
        "settlement_basis": "배당 재원 = 신탁 계좌로 분할된 유료 결제액 − 인앱결제 수수료 (열람 기록이 아닌 결제 기준)",
        "verification": [
            "결제 시점 분할: 상장 작품 결제는 DIBS 매출 계정을 거치지 않고 신탁 계좌로 바로 입금",
            "분기 대사: 결제 원천 합계 = 신탁 입금 합계 = 배당 재원 기록, 누수 결제 0건",
            "원장 해시 공시: 분기별 결제 기록 SHA-256 연쇄 해시 (사후 변경 시 값이 달라짐)",
            "실서비스: PG 정산 내역과 월별 대사, 신탁사 계좌에서 분배, 연 1회 외부 회계감사",
        ],
        "reconciliation": [reconcile(db, f, p) for p in periods_since_listing(f, now)],
    }
