"""안분 배정 전략.

기획 확정 전이라 전략을 교체할 수 있게 분리했다.
- PRO_RATA: 청약 비율대로 내림 배정 → 남는 조각은 소수부가 큰 회원부터 1개씩
            (같으면 먼저 청약한 회원). 소액 청약자는 0조각 가능. (기획안 v2.0 기준)
- EQUAL_THEN_PRO_RATA: 목표의 일정 비율(기본 20%)을 먼저 균등 배정한 뒤 나머지를 PRO_RATA.
            v4.0: 균등분 중 early_reader_bps(기본 발행량의 10%)는 펀딩 전에 찜한 '초기 독자'에게
            먼저 균등 배정하고, 남으면 일반 균등분으로 넘긴다.
            균등분이 참여자 수보다 적어 모두에게 1조각씩 못 줄 때는 선착순이 아니라
            공개 시드(lottery_seed) 추첨 순서로 나눈다 (공모주 균등배정의 추첨 방식).

모든 전략은 순수 함수이며 DB 를 모른다 → 단위 테스트·시뮬레이션에 그대로 쓸 수 있다.
"""
import hashlib
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class AllocationRequest:
    key: int  # subscription id
    units: int
    order: tuple  # 동점 처리용 정렬 키 (first_subscribed_at, id)
    early: bool = False  # 초기 독자 (펀딩 전 찜)


class AllocationStrategy(Protocol):
    name: str

    def allocate(self, requests: list[AllocationRequest], target: int) -> dict[int, int]: ...


def _validate(requests: list[AllocationRequest], target: int) -> int:
    if target <= 0:
        raise ValueError("target 은 1 이상이어야 합니다")
    if any(r.units <= 0 for r in requests):
        raise ValueError("청약 수량은 1 이상이어야 합니다")
    return sum(r.units for r in requests)


class ProRataLargestRemainder:
    name = "PRO_RATA"

    def allocate(self, requests: list[AllocationRequest], target: int) -> dict[int, int]:
        total = _validate(requests, target)
        if total <= target:
            return {r.key: r.units for r in requests}

        alloc: dict[int, int] = {}
        remainders: list[tuple[int, AllocationRequest]] = []
        for r in requests:
            q, rem = divmod(r.units * target, total)  # 정수 연산 → 부동소수 오차 없음
            alloc[r.key] = q
            remainders.append((rem, r))

        left = target - sum(alloc.values())
        remainders.sort(key=lambda x: (-x[0], x[1].order))
        for rem, r in remainders:
            if left == 0:
                break
            if alloc[r.key] < r.units:
                alloc[r.key] += 1
                left -= 1
        assert left == 0 and sum(alloc.values()) == target
        return alloc


class EqualThenProRata:
    name = "EQUAL_THEN_PRO_RATA"

    def __init__(self, equal_ratio_bps: int = 2000, early_reader_bps: int = 0, lottery_seed: int | None = None):
        if not 0 <= equal_ratio_bps <= 10000:
            raise ValueError("equal_ratio_bps 는 0~10000")
        if not 0 <= early_reader_bps <= equal_ratio_bps:
            raise ValueError("early_reader_bps 는 0~equal_ratio_bps")
        self.equal_ratio_bps = equal_ratio_bps
        self.early_reader_bps = early_reader_bps
        self.lottery_seed = lottery_seed

    def _equal_order(self, requests: list[AllocationRequest]) -> list[AllocationRequest]:
        """균등 단계 순서. 시드가 있으면 sha256(시드:청약번호) 추첨 순서, 없으면 먼저 청약한 순."""
        if self.lottery_seed is None:
            return sorted(requests, key=lambda r: r.order)
        return sorted(requests, key=lambda r: hashlib.sha256(f"{self.lottery_seed}:{r.key}".encode()).hexdigest())

    @staticmethod
    def _pro_rata_by_original(ordered: list[AllocationRequest], alloc: dict[int, int], remaining: int) -> None:
        """remaining 을 원래 청약 수량 비율로 나누되 각자 남은 수요를 넘지 않게. 넘친 몫은 다시 나눈다."""
        while remaining > 0:
            active = [r for r in ordered if alloc[r.key] < r.units]
            if not active:
                break
            weight = sum(r.units for r in active)
            given, rems = 0, []
            for r in active:
                q, rem = divmod(remaining * r.units, weight)
                g = min(q, r.units - alloc[r.key])
                alloc[r.key] += g
                given += g
                rems.append((rem, r))
            left = remaining - given
            rems.sort(key=lambda x: (-x[0], x[1].order))
            for _, r in rems:
                if left == 0:
                    break
                if alloc[r.key] < r.units:
                    alloc[r.key] += 1
                    left -= 1
            if left == remaining:  # 더 줄 수 없음
                break
            remaining = left

    @staticmethod
    def _spread(pool: int, members: list[AllocationRequest], alloc: dict[int, int]) -> int:
        """pool 을 남은 수요가 있는 members 에게 고르게 나눈다 (부족하면 먼저 청약한 순). 쓰고 남은 양을 돌려준다."""
        while pool > 0:
            active = [r for r in members if alloc[r.key] < r.units]
            if not active:
                break
            share = pool // len(active)
            if share == 0:
                for r in active[:pool]:
                    alloc[r.key] += 1
                return 0
            for r in active:
                give = min(share, r.units - alloc[r.key])
                alloc[r.key] += give
                pool -= give
        return pool

    def allocate(self, requests: list[AllocationRequest], target: int) -> dict[int, int]:
        total = _validate(requests, target)
        if total <= target:
            return {r.key: r.units for r in requests}

        ordered = sorted(requests, key=lambda r: r.order)
        drawn = self._equal_order(requests)
        alloc = {r.key: 0 for r in ordered}
        early_pool = target * self.early_reader_bps // 10000
        general_pool = target * self.equal_ratio_bps // 10000 - early_pool

        # 0단계: 초기 독자 우선 균등 배정. 남은 양은 일반 균등분으로 넘긴다
        left = self._spread(early_pool, [r for r in drawn if r.early], alloc)
        # 1단계: 일반 균등 배정 (참여자 전원)
        self._spread(general_pool + left, drawn, alloc)

        # 2단계: 남은 목표를 '원래 청약 수량' 비율대로 (공모주 비례배정과 같은 기준).
        # 남은 수요 기준으로 나누면 균등·초기 독자 몫을 받은 사람이 비례분에서 다시 깎이므로 쓰지 않는다.
        self._pro_rata_by_original(ordered, alloc, target - sum(alloc.values()))
        assert sum(alloc.values()) == target
        return alloc


def get_strategy(name: str, params: dict | None = None) -> AllocationStrategy:
    params = params or {}
    if name == ProRataLargestRemainder.name:
        return ProRataLargestRemainder()
    if name == EqualThenProRata.name:
        return EqualThenProRata(**params)
    raise ValueError(f"알 수 없는 배정 전략: {name}")


STRATEGIES = [ProRataLargestRemainder.name, EqualThenProRata.name]
