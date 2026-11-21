"""연재 약정과 연재 위험 (태업·조기 완결·사회적 물의·불가피한 중단).

약정
- 시즌 약정 회차(기본 40화)와 기한(한 달 4화). 공모 전 비축분 ≥ 약정 회차의 25% (DIBS 심사 때 확인).
- 미리 알린 휴재는 시즌 중 누적 8주까지만 기한에서 빼 준다.
- 작가 지급: 상장 40% · 약정 절반 연재 30% · 약정 회차 완결 30%. 회차가 올라오면 자동 지급한다.

지연 (태업)
- 한 달치(4화) 이상 밀리면 경고하고 보유자·증권사에 알린다.
- 석 달치(12화) 밀리면 작가 귀책 중단으로 처리한다.

조기 완결
- 약정 회차 전에 완결하면 남은 지급분을 연재한 회차 비율만큼만 주고 나머지는 보유자에게 나눈다.
- 권리 종료는 '완결 후 12개월'과 '상장 후 24개월' 중 늦은 쪽 (투자자 기간 보전).

중단
- 불가피한 사유(NO_FAULT, 건강·불가항력): 남은 작가 지급분을 보유자에게. 유보금은 종료 때 작가에게.
- 작가 귀책(FAULT, 유죄 판결·표절·권리 분쟁·계약 위반·연재 기한 초과): 남은 지급분 + 유보금 전액을 보유자에게,
  이미 받은 작가 지급금의 50%를 반환 청구. 청구액을 다 채울 때까지 작가 매출 몫은 투자자에게 간다.

최소 유보금 (v2.3, 모금액의 5%, 신탁 보관)
- 약정 회차를 다 연재하고 완결하면 작가에게 준다. 조기 완결이면 연재 비율만큼 작가, 나머지는 보유자.
- 연재 중단(귀책·불가피 모두)이면 전액 보유자에게 나눈다. 유보금은 연재가 끝까지 가지 못했을 때 투자자 손실을 줄이는 돈이다.

돈이 보유자에게 가는 경로: INTERNAL 모드는 바로 예치금, BROKER 모드는 특별 분배 지시서 → 증권사 지급 → 완료 웹훅.
"""
import math

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core import clock
from app.core.config import settings
from app.core.errors import Conflict, DomainError, NotFound
from app.models import BrokerNotice, Episode, Funding, Holding, PayoutSchedule, SpecialDistribution, Work
from app.models.enums import AccountKind, DiscontinueKind, FundingStatus, PayoutStatus
from app.services import ledger
from app.services.ledger import Leg
from app.services.policy import notify

DAYS_PER_MONTH = 30


# ───────────────────────────── 약정 ─────────────────────────────

def required_buffer(committed: int) -> int:
    return math.ceil(committed * settings.buffer_bps / 10000)


def episodes_for(committed: int, episodes_bps: int) -> int:
    return math.ceil(committed * episodes_bps / 10000)


def validate_commitment(f: Funding, check_buffer: bool = False) -> None:
    if f.committed_episodes < settings.min_committed_episodes:
        raise DomainError("INVALID_TERMS", f"시즌 약정 회차는 {settings.min_committed_episodes}화 이상이어야 해요")
    if f.monthly_quota < 1:
        raise DomainError("INVALID_TERMS", "한 달 연재 회차는 1화 이상이어야 해요")
    if check_buffer and settings.enforce_buffer:  # 비축분은 DIBS 심사(승인) 때 확인
        need = required_buffer(f.committed_episodes)
        if (f.buffer_episodes or 0) < need:
            raise DomainError("BUFFER_SHORT", f"공모 전 비축분이 {need}화(약정 회차의 25%) 이상이어야 해요")


# ───────────────────────────── 진행 ─────────────────────────────

def _episode_count(db: Session, work_id: int) -> int:
    return int(db.scalar(select(func.count(Episode.id)).where(Episode.work_id == work_id)) or 0)


def mark_listing(db: Session, f: Funding) -> None:
    f.episodes_at_listing = _episode_count(db, f.work_id)


def season_published(db: Session, f: Funding) -> int:
    if f.episodes_at_listing is None:
        return 0
    return max(0, _episode_count(db, f.work_id) - f.episodes_at_listing)


def progress(db: Session, f: Funding) -> dict:
    published = season_published(db, f)
    credited = min(f.hiatus_weeks_used, settings.hiatus_limit_weeks)
    expected = delay = 0
    if f.listed_at:
        days = max(0, (clock.now() - f.listed_at).days - credited * 7)
        expected = min(f.committed_episodes, days * f.monthly_quota // DAYS_PER_MONTH)
        if not (f.completed_at or f.discontinued_at):
            delay = max(0, expected - published)
    if f.discontinued_at:
        state = "DISCONTINUED"
    elif f.completed_at:
        state = "EARLY_COMPLETED" if f.early_completed else "COMPLETED"
    elif delay >= settings.delay_breach_months * f.monthly_quota:
        state = "BREACH"
    elif delay >= settings.delay_warning_months * f.monthly_quota:
        state = "WARNING"
    else:
        state = "ON_TRACK"
    pending = [p for p in _schedules(db, f) if p.status == PayoutStatus.PENDING and p.episodes_required]
    return {
        "committed_episodes": f.committed_episodes, "monthly_quota": f.monthly_quota,
        "buffer_episodes": f.buffer_episodes, "required_buffer": required_buffer(f.committed_episodes),
        "published": published, "expected": expected, "delay_episodes": delay,
        "hiatus_weeks_used": f.hiatus_weeks_used, "hiatus_limit_weeks": settings.hiatus_limit_weeks,
        "state": state,
        "next_payout_at_episode": pending[0].episodes_required if pending else None,
        "discontinue_kind": f.discontinue_kind,
        "creator_escrow_balance": f.creator_escrow_balance,
        "clawback_due": f.clawback_due, "clawback_collected": f.clawback_collected,
        "clawback_outstanding": max(0, f.clawback_due - f.clawback_collected),
    }


def overview(db: Session, f: Funding) -> dict:
    """공개용: 연재 약정·진행, 유보금·반환 청구, 특별 분배 내역."""
    dists = db.scalars(select(SpecialDistribution).where(SpecialDistribution.funding_id == f.id)
                       .order_by(SpecialDistribution.id))
    return {**progress(db, f),
            "rules": {"delay_warning_episodes": settings.delay_warning_months * f.monthly_quota,
                      "delay_breach_episodes": settings.delay_breach_months * f.monthly_quota,
                      "clawback_bps": settings.clawback_bps, "creator_escrow_bps": settings.creator_escrow_bps,
                      "min_term_after_listing_months": settings.min_term_after_listing_months},
            "special_distributions": [{"id": d.id, "kind": d.kind, "amount": d.amount, "status": d.status,
                                       "holders": len(d.lines), "created_at": d.created_at}
                                      for d in dists]}


def _schedules(db: Session, f: Funding) -> list[PayoutSchedule]:
    return list(db.scalars(select(PayoutSchedule).where(PayoutSchedule.funding_id == f.id)
                           .order_by(PayoutSchedule.seq)))


def _live(db: Session, work_id: int) -> Funding | None:
    return db.scalar(select(Funding).where(Funding.work_id == work_id, Funding.status == FundingStatus.LISTED,
                                           Funding.completed_at.is_(None), Funding.discontinued_at.is_(None))
                     .order_by(Funding.id.desc()))


def _require_live(f: Funding) -> None:
    if f.status not in (FundingStatus.LISTED, FundingStatus.SUSPENDED):
        raise Conflict("INVALID_FUNDING_STATUS", f"현재 상태({f.status})에서는 할 수 없어요")


def _notice(db: Session, f: Funding, kind: str, payload: dict) -> None:
    db.add(BrokerNotice(broker=settings.broker_code, funding_id=f.id, kind=kind, payload=payload))


def _holders(db: Session, f: Funding) -> list[Holding]:
    return list(db.scalars(select(Holding).where(Holding.funding_id == f.id, Holding.mode == f.mode,
                                                 Holding.units > 0).order_by(Holding.user_id)))


def _notify_holders(db: Session, f: Funding, kind: str, title: str, body: str = "") -> None:
    for h in _holders(db, f):
        notify(db, h.user_id, kind, title, body, "funding", f.id)


# ───────────────────────────── 지급 ─────────────────────────────

def _pay_creator(db: Session, f: Funding, work: Work, ps: PayoutSchedule, amount: int) -> None:
    if amount:
        j = ledger.post(db, "CREATOR_PAYOUT", [
            Leg(ledger.sys(db, AccountKind.SYS_CREATOR_PAYABLE, f.mode), -amount),
            Leg(ledger.user_accounts(db, work.creator_id, f.mode).deposit, amount),
        ], f.mode, "payout_schedule", ps.id)
        ps.paid_journal_id = j.id
        notify(db, work.creator_id, "CREATOR_PAYOUT", f"「{work.title}」 펀딩 지급금 {amount:,}원이 들어왔어요",
               ref_type="funding", ref_id=f.id)
    ps.status = PayoutStatus.PAID


def on_episode_published(db: Session, work: Work) -> list[int]:
    """회차가 올라올 때: 약정 회차 마일스톤에 닿은 작가 지급분을 자동 지급하고, 약정 회차에 닿으면 시즌 완결."""
    f = _live(db, work.id)
    if f is None:
        return []
    published = season_published(db, f)
    paid = []
    for ps in _schedules(db, f):
        if ps.status == PayoutStatus.PENDING and ps.episodes_required and published >= ps.episodes_required:
            _pay_creator(db, f, work, ps, ps.amount or 0)
            paid.append(ps.seq)
    if published >= f.committed_episodes:
        f.completed_at = clock.now()
        _notice(db, f, "SEASON_COMPLETED", {"published": published, "committed": f.committed_episodes})
    db.flush()
    return paid


def pay_milestone(db: Session, f: Funding, seq: int) -> PayoutSchedule:
    """운영자 수동 지급 (회차 기준이 없는 맞춤 일정용). 회차 기준 지급분은 회차가 닿아야 한다."""
    _require_live(f)
    ps = db.scalar(select(PayoutSchedule).where(PayoutSchedule.funding_id == f.id, PayoutSchedule.seq == seq))
    if ps is None:
        raise NotFound("PAYOUT_NOT_FOUND", "지급 일정을 찾을 수 없어요")
    if ps.status != PayoutStatus.PENDING:
        raise Conflict("PAYOUT_ALREADY_DONE", "이미 처리된 지급이에요")
    if ps.episodes_required and season_published(db, f) < ps.episodes_required:
        raise Conflict("EPISODES_NOT_REACHED", f"시즌 연재가 {ps.episodes_required}화에 닿아야 지급할 수 있어요")
    _pay_creator(db, f, db.get(Work, f.work_id), ps, ps.amount or 0)
    return ps


# ───────────────────────────── 보유자 특별 분배 ─────────────────────────────

def distribute(db: Session, f: Funding, amount: int, source, kind: str, memo: str,
               title: str) -> SpecialDistribution | None:
    """보유 비율대로 나눈다. source = 시스템 계정 종류(AccountKind) 또는 계좌(작가 반환금은 작가 예치금)."""
    holders = _holders(db, f)
    total_units = sum(h.units for h in holders)
    if amount <= 0 or total_units == 0:
        return None
    lines, paid = [], 0
    for h in holders:
        amt = amount * h.units // total_units
        paid += amt
        lines.append({"user_id": h.user_id, "units": h.units, "amount": amt})
    src_acc = ledger.sys(db, source, f.mode) if isinstance(source, AccountKind) else source
    broker_mode = settings.subscription_channel == "BROKER"
    sd = SpecialDistribution(funding_id=f.id, kind=kind, amount=paid, lines=lines, memo=memo,
                             status="INSTRUCTED" if broker_mode else "PAID")
    db.add(sd)
    db.flush()
    legs = [Leg(src_acc, -amount)]
    if amount - paid:
        legs.append(Leg(ledger.sys(db, AccountKind.SYS_PLATFORM_REVENUE, f.mode), amount - paid))  # 원 단위 절사 잔여
    if broker_mode:
        legs.append(Leg(ledger.sys(db, AccountKind.SYS_SPECIAL_PAYABLE, f.mode), paid))
        _notice(db, f, "SPECIAL_DISTRIBUTION", {"special_id": sd.id, "kind": kind, "amount": paid})
    else:
        legs += [Leg(ledger.user_accounts(db, l["user_id"], f.mode).deposit, l["amount"]) for l in lines]
        sd.paid_at = clock.now()
        for l in lines:
            notify(db, l["user_id"], f"SPECIAL_{kind}", title, f"{l['amount']:,}원이 예치금으로 들어왔어요.",
                   "funding", f.id)
    ledger.post(db, f"SPECIAL_{kind}", legs, f.mode, "special_distribution", sd.id, memo=memo)
    return sd


def settle_special(db: Session, sd_id: int) -> SpecialDistribution:
    """BROKER 모드: 증권사가 지급을 마치면(모의: 예치금 입금) 확정한다."""
    sd = db.get(SpecialDistribution, sd_id)
    if sd is None:
        raise NotFound("SPECIAL_NOT_FOUND", "특별 분배 내역을 찾을 수 없어요")
    if sd.status == "PAID":
        raise Conflict("SPECIAL_ALREADY_PAID", "이미 지급한 분배예요")
    f = db.get(Funding, sd.funding_id)
    legs = [Leg(ledger.sys(db, AccountKind.SYS_SPECIAL_PAYABLE, f.mode), -sd.amount)]
    legs += [Leg(ledger.user_accounts(db, l["user_id"], f.mode).deposit, l["amount"]) for l in sd.lines]
    ledger.post(db, "SPECIAL_SETTLED", legs, f.mode, "special_distribution", sd.id)
    sd.status, sd.paid_at = "PAID", clock.now()
    return sd


# ───────────────────────────── 휴재·지연 ─────────────────────────────

def record_hiatus(db: Session, f: Funding, weeks: int, reason: str) -> dict:
    _require_live(f)
    if f.completed_at or f.discontinued_at:
        raise Conflict("SEASON_CLOSED", "완결되거나 중단된 시즌이에요")
    if weeks < 1:
        raise DomainError("INVALID_HIATUS", "휴재 기간은 1주 이상이에요")
    before = f.hiatus_weeks_used
    f.hiatus_weeks_used += weeks
    over = max(0, f.hiatus_weeks_used - settings.hiatus_limit_weeks) - max(0, before - settings.hiatus_limit_weeks)
    work = db.get(Work, f.work_id)
    _notify_holders(db, f, "SERIAL_HIATUS", f"「{work.title}」 {weeks}주 휴재 공지",
                    reason + (f" · 휴재 한도를 {over}주 넘어 그만큼은 연재 기한에서 빼지 않아요" if over else ""))
    _notice(db, f, "HIATUS", {"weeks": weeks, "reason": reason, "used": f.hiatus_weeks_used, "over_limit": over})
    db.flush()
    return {**progress(db, f), "over_limit_weeks": over}


def check_delay(db: Session, f: Funding) -> dict:
    """지연 판정 (매일 배치). 석 달치 밀리면 귀책 중단, 한 달치면 1회 경고."""
    p = progress(db, f)
    action = None
    if p["state"] == "BREACH":
        discontinue(db, f, f"연재 기한 초과: {p['delay_episodes']}화 지연", DiscontinueKind.FAULT)
        action = "DISCONTINUED"
    elif p["state"] == "WARNING" and not f.delay_warned_at:
        f.delay_warned_at = clock.now()
        work = db.get(Work, f.work_id)
        _notify_holders(db, f, "SERIAL_DELAY", f"「{work.title}」 연재가 {p['delay_episodes']}화 밀렸어요",
                        f"{settings.delay_breach_months * f.monthly_quota}화 밀리면 작가 귀책 중단으로 처리돼요.")
        _notice(db, f, "SERIAL_DELAY_WARNING", {"delay_episodes": p["delay_episodes"], "expected": p["expected"],
                                                "published": p["published"]})
        action = "WARNED"
    elif p["state"] == "ON_TRACK" and f.delay_warned_at:
        f.delay_warned_at = None  # 따라잡으면 경고 해제 (다음 지연 때 다시 경고)
        action = "CLEARED"
    db.flush()
    return {**progress(db, f), "action": action}


def check_all(db: Session) -> dict:
    out = {"checked": 0, "warned": 0, "discontinued": 0}
    for f in db.scalars(select(Funding).where(Funding.status == FundingStatus.LISTED,
                                              Funding.completed_at.is_(None), Funding.discontinued_at.is_(None))):
        r = check_delay(db, f)
        out["checked"] += 1
        out["warned"] += r["action"] == "WARNED"
        out["discontinued"] += r["action"] == "DISCONTINUED"
    return out


# ───────────────────────────── 완결·중단 ─────────────────────────────

def complete_season(db: Session, f: Funding) -> dict:
    """완결 확정. 약정 회차 전이면 조기 완결: 남은 작가 지급분을 연재 비율만큼만 주고 나머지는 보유자에게."""
    _require_live(f)
    if f.completed_at:
        raise Conflict("ALREADY_COMPLETED", "이미 완결 처리된 작품이에요")
    if f.discontinued_at:
        raise Conflict("ALREADY_DISCONTINUED", "연재 중단된 작품이에요")
    work = db.get(Work, f.work_id)
    published = season_published(db, f)
    early = published < f.committed_episodes
    to_creator = to_holders = 0
    for ps in _schedules(db, f):
        if ps.status != PayoutStatus.PENDING:
            continue
        amount = ps.amount or 0
        part = amount * published // f.committed_episodes if early else amount
        _pay_creator(db, f, work, ps, part)
        to_creator += part
        to_holders += amount - part
        if early:
            ps.milestone_note = f"{ps.milestone_note} (조기 완결 {published}/{f.committed_episodes}화 비율 지급)"
    reserve = f.reserve_balance or 0
    reserve_creator = reserve * published // f.committed_episodes if early else reserve
    if reserve_creator:
        ledger.post(db, "RESERVE_RELEASE", [
            Leg(ledger.sys(db, AccountKind.SYS_TRUST_RESERVE, f.mode), -reserve_creator),
            Leg(ledger.user_accounts(db, work.creator_id, f.mode).deposit, reserve_creator),
        ], f.mode, "funding", f.id, memo="완결: 최소 유보금 작가 지급")
        notify(db, work.creator_id, "RESERVE_RELEASED", f"「{work.title}」 완결 유보금 {reserve_creator:,}원이 들어왔어요",
               ref_type="funding", ref_id=f.id)
    if reserve - reserve_creator:
        distribute(db, f, reserve - reserve_creator, AccountKind.SYS_TRUST_RESERVE, "RESERVE_EARLY_COMPLETION",
                   f"조기 완결 유보금 {published}/{f.committed_episodes}화",
                   f"「{work.title}」 조기 완결로 남은 유보금을 나눠 드렸어요")
    f.reserve_balance = 0
    sd = None
    if to_holders:
        sd = distribute(db, f, to_holders, AccountKind.SYS_CREATOR_PAYABLE, "EARLY_COMPLETION",
                        f"조기 완결 {published}/{f.committed_episodes}화",
                        f"「{work.title}」 조기 완결로 줄어든 작가 지급분을 나눠 드렸어요")
    f.completed_at, f.early_completed = clock.now(), early
    _notice(db, f, "SEASON_COMPLETED", {"published": published, "committed": f.committed_episodes, "early": early,
                                        "to_holders": to_holders})
    db.flush()
    return {"early": early, "published": published, "committed": f.committed_episodes,
            "paid_to_creator": to_creator, "distributed_to_holders": to_holders,
            "reserve_to_creator": reserve_creator, "reserve_to_holders": reserve - reserve_creator,
            "special_distribution_id": sd.id if sd else None}


def discontinue(db: Session, f: Funding, reason: str, kind: DiscontinueKind | str = DiscontinueKind.NO_FAULT) -> dict:
    """연재 중단 확정. 남은 작가 지급분은 보유자에게. 귀책이면 유보금도 보유자에게, 받은 지급금 50% 반환 청구."""
    _require_live(f)
    kind = DiscontinueKind(kind)
    if f.discontinued_at:
        raise Conflict("ALREADY_DISCONTINUED", "이미 연재 중단 처리된 종목이에요")
    work = db.get(Work, f.work_id)
    schedules = _schedules(db, f)
    pending = [p for p in schedules if p.status == PayoutStatus.PENDING]
    remaining = sum(p.amount or 0 for p in pending)
    for p in pending:
        p.status = PayoutStatus.CANCELLED
    sd = distribute(db, f, remaining, AccountKind.SYS_CREATOR_PAYABLE, "DISCONTINUE", reason,
                    f"「{work.title}」 연재 중단으로 미지급 작가 지급분을 나눠 드렸어요")
    reserve = f.reserve_balance or 0
    if reserve and distribute(db, f, reserve, AccountKind.SYS_TRUST_RESERVE, "RESERVE_DISCONTINUE", reason,
                              f"「{work.title}」 연재 중단으로 신탁 유보금을 나눠 드렸어요"):
        f.reserve_balance = 0
    forfeited = 0
    if kind == DiscontinueKind.FAULT:
        paid_total = sum(p.amount or 0 for p in schedules if p.status == PayoutStatus.PAID)
        f.clawback_due = paid_total * settings.clawback_bps // 10000
        forfeited = f.creator_escrow_balance
        if forfeited:
            distribute(db, f, forfeited, AccountKind.SYS_CREATOR_ESCROW, "ESCROW_FORFEIT", reason,
                       f"「{work.title}」 작가 귀책 중단으로 유보된 작가 몫을 나눠 드렸어요")
            f.clawback_collected = min(f.clawback_due, forfeited)
            f.creator_escrow_balance = 0
        notify(db, work.creator_id, "CLAWBACK_DUE", f"「{work.title}」 귀책 중단: 지급금 반환 청구 "
               f"{max(0, f.clawback_due - f.clawback_collected):,}원", reason, "funding", f.id)
    f.discontinued_at, f.discontinue_kind = clock.now(), kind.value
    f.status, f.review_note = FundingStatus.SUSPENDED, reason
    _notice(db, f, "DISCONTINUED", {"kind": kind.value, "reason": reason, "distributed": sd.amount if sd else 0,
                                    "escrow_forfeited": forfeited, "clawback_due": f.clawback_due})
    db.flush()
    return {"kind": kind.value, "cancelled_payout_amount": remaining, "distributed": sd.amount if sd else 0,
            "reserve_distributed": reserve - (f.reserve_balance or 0),
            "holders": len(sd.lines) if sd else len(_holders(db, f)), "escrow_forfeited": forfeited,
            "clawback_due": f.clawback_due, "clawback_outstanding": max(0, f.clawback_due - f.clawback_collected)}


def collect_clawback(db: Session, f: Funding, amount: int) -> dict:
    """작가가 반환 청구액을 갚으면 보유자에게 나눈다."""
    outstanding = max(0, f.clawback_due - f.clawback_collected)
    if f.discontinue_kind != DiscontinueKind.FAULT or outstanding == 0:
        raise Conflict("NO_CLAWBACK", "반환 청구액이 없어요")
    if not 0 < amount <= outstanding:
        raise DomainError("INVALID_AMOUNT", f"1원 이상 {outstanding:,}원 이하로 입력해 주세요")
    work = db.get(Work, f.work_id)
    acc = ledger.user_accounts(db, work.creator_id, f.mode).deposit
    if ledger.balance(db, acc) < amount:
        raise DomainError("INSUFFICIENT_BALANCE", "작가 예치금이 부족해요")
    sd = distribute(db, f, amount, acc, "CLAWBACK", "귀책 중단 반환금",
                    f"「{work.title}」 작가 반환금을 나눠 드렸어요")
    f.clawback_collected += amount
    return {"collected": amount, "clawback_outstanding": f.clawback_due - f.clawback_collected,
            "special_distribution_id": sd.id if sd else None}


def release_escrow(db: Session, f: Funding, reason: str) -> int:
    """회수 달성·권리 종료 때 유보금을 작가에게 (귀책 중단이면 이미 보유자에게 갔다)."""
    amount = f.creator_escrow_balance
    if amount <= 0 or f.discontinue_kind == DiscontinueKind.FAULT:
        return 0
    work = db.get(Work, f.work_id)
    ledger.post(db, "CREATOR_ESCROW_RELEASE", [
        Leg(ledger.sys(db, AccountKind.SYS_CREATOR_ESCROW, f.mode), -amount),
        Leg(ledger.user_accounts(db, work.creator_id, f.mode).deposit, amount),
    ], f.mode, "funding", f.id, memo=reason)
    f.creator_escrow_balance = 0
    notify(db, work.creator_id, "CREATOR_ESCROW_RELEASED", f"「{work.title}」 유보된 매출 몫 {amount:,}원이 들어왔어요",
           reason, "funding", f.id)
    return amount


def broker_notices(db: Session, after_id: int = 0, limit: int = 100) -> dict:
    rows = list(db.scalars(select(BrokerNotice).where(BrokerNotice.broker == settings.broker_code,
                                                      BrokerNotice.id > after_id)
                           .order_by(BrokerNotice.id).limit(limit)))
    return {"items": [{"id": n.id, "funding_id": n.funding_id, "kind": n.kind, "payload": n.payload,
                       "created_at": n.created_at.isoformat()} for n in rows],
            "next_after_id": rows[-1].id if rows else after_id}

