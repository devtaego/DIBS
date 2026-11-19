import random

import pytest

from app.services.allocation import AllocationRequest, EqualThenProRata, ProRataLargestRemainder


def reqs(units: list[int]) -> list[AllocationRequest]:
    return [AllocationRequest(key=i, units=u, order=(i,)) for i, u in enumerate(units)]


def test_under_or_equal_target_gets_all():
    assert ProRataLargestRemainder().allocate(reqs([3, 5]), 10) == {0: 3, 1: 5}
    assert ProRataLargestRemainder().allocate(reqs([5, 5]), 10) == {0: 5, 1: 5}


def test_842_percent_oversubscription_invariants():
    """목표 1,000조각에 8,420조각 청약 (달성률 842%)."""
    rnd = random.Random(842)
    units = [rnd.randint(1, 300) for _ in range(60)]
    units[-1] += 8420 - sum(units)  # 합계를 정확히 8,420 으로
    assert sum(units) == 8420 and units[-1] > 0
    alloc = ProRataLargestRemainder().allocate(reqs(units), 1000)

    assert sum(alloc.values()) == 1000
    for i, u in enumerate(units):
        assert 0 <= alloc[i] <= u
        exact = u * 1000 / 8420
        assert int(exact) <= alloc[i] <= int(exact) + 1  # 내림 + 최대 1개
    # 많이 청약한 사람이 적게 받지 않는다 (단조성)
    by_units = sorted(range(len(units)), key=lambda i: units[i])
    assert all(alloc[a] <= alloc[b] for a, b in zip(by_units, by_units[1:]) if units[a] < units[b])


def test_tie_break_goes_to_earlier_subscriber():
    # 3명 각 1조각, 목표 2 → 소수부 동일, 먼저 청약한 0·1번이 받음
    assert ProRataLargestRemainder().allocate(reqs([1, 1, 1]), 2) == {0: 1, 1: 1, 2: 0}


def test_small_subscriber_can_get_zero_in_pro_rata():
    alloc = ProRataLargestRemainder().allocate(reqs([1000, 1000, 1]), 100)
    assert alloc[2] == 0 and sum(alloc.values()) == 100


def test_equal_then_pro_rata_protects_small_subscribers():
    alloc = EqualThenProRata(equal_ratio_bps=2000).allocate(reqs([1000, 1000, 1]), 100)
    assert alloc[2] == 1  # 균등 배정분으로 최소 1조각
    assert sum(alloc.values()) == 100


@pytest.mark.parametrize("seed", range(20))
def test_equal_then_pro_rata_invariants(seed):
    rnd = random.Random(seed)
    units = [rnd.randint(1, 50) for _ in range(rnd.randint(1, 80))]
    target = rnd.randint(1, max(1, sum(units) - 1)) if sum(units) > 1 else 1
    for strat in (ProRataLargestRemainder(), EqualThenProRata(rnd.choice([0, 1000, 3000, 10000]))):
        alloc = strat.allocate(reqs(units), target)
        assert sum(alloc.values()) == min(target, sum(units))
        assert all(0 <= alloc[i] <= u for i, u in enumerate(units))


def test_early_reader_pool_first_then_general_equal():
    """v4.0: 발행량 20% 균등 중 10%는 초기 독자에게 먼저. 남는 초기 독자 몫은 일반 균등으로 넘어간다."""
    reqs = [AllocationRequest(1, 100, (1,), early=True), AllocationRequest(2, 100, (2,)), AllocationRequest(3, 100, (3,))]
    alloc = EqualThenProRata(2000, 1000).allocate(reqs, 100)
    assert sum(alloc.values()) == 100 and alloc[1] > alloc[2] == alloc[3]
    # 초기 독자가 없으면 20% 전부 일반 균등
    plain = [AllocationRequest(k, 100, (k,)) for k in (1, 2, 3)]
    assert EqualThenProRata(2000, 1000).allocate(plain, 100) == EqualThenProRata(2000).allocate(plain, 100)
