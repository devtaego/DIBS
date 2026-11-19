"""안분 배정 전략.

기획 확정 전이라 전략을 교체할 수 있게 분리했다.
- PRO_RATA: 청약 비율대로 내림 배정 → 남는 조각은 소수부가 큰 회원부터 1개씩
            (같으면 먼저 청약한 회원). 소액 청약자는 0조각 가능. (기획안 v2.0 기준)
- EQUAL_THEN_PRO_RATA: 목표의 일정 비율을 먼저 균등 배정한 뒤 나머지를 PRO_RATA.
            금융위가 권고한 '균등배정 최소 비율' 대응안.

모든 전략은 순수 함수이며 DB 를 모른다 → 단위 테스트·시뮬레이션에 그대로 쓸 수 있다.
"""
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class AllocationRequest:
    key: int  # subscription id
    units: int
    order: tuple  # 동점 처리용 정렬 키 (first_subscribed_at, id)


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

    def __init__(self, equal_ratio_bps: int = 2000):
        if not 0 <= equal_ratio_bps <= 10000:
            raise ValueError("equal_ratio_bps 는 0~10000")
        self.equal_ratio_bps = equal_ratio_bps

    def allocate(self, requests: list[AllocationRequest], target: int) -> dict[int, int]:
        total = _validate(requests, target)
        if total <= target:
            return {r.key: r.units for r in requests}

        ordered = sorted(requests, key=lambda r: r.order)
        alloc = {r.key: 0 for r in ordered}
        pool = target * self.equal_ratio_bps // 10000

        # 1단계: 균등 배정 (남은 수요가 있는 회원에게 고르게, 부족하면 먼저 청약한 순)
        while pool > 0:
            active = [r for r in ordered if alloc[r.key] < r.units]
            if not active:
                break
            share = pool // len(active)
            if share == 0:
                for r in active[:pool]:
                    alloc[r.key] += 1
                pool = 0
                break
            for r in active:
                give = min(share, r.units - alloc[r.key])
                alloc[r.key] += give
                pool -= give

        # 2단계: 남은 목표를 남은 수요 비율대로
        remaining_target = target - sum(alloc.values())
        residual = [
            AllocationRequest(r.key, r.units - alloc[r.key], r.order) for r in ordered if r.units > alloc[r.key]
        ]
        if remaining_target > 0 and residual:
            for k, v in ProRataLargestRemainder().allocate(residual, remaining_target).items():
                alloc[k] += v
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
