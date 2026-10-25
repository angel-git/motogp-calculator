import { describe, expect, it } from 'vitest';
import {
  addFinishToCountback,
  compareByPointsAndCountback,
  compareCountback,
  comparePlacementCounts,
} from '../src/domain/tiebreak';
import type { Countback, EventType } from '../src/domain/types';

function countback(grandPrix: number[], sprint: number[] = []): Countback {
  return { grandPrix, sprint };
}

describe('comparePlacementCounts', () => {
  it('compares wins before lower placings', () => {
    expect(comparePlacementCounts([2, 0], [1, 9])).toBeGreaterThan(0);
    expect(comparePlacementCounts([1, 0], [2, 0])).toBeLessThan(0);
  });

  it('compares deeper placings when wins are equal', () => {
    expect(comparePlacementCounts([1, 0, 3], [1, 0, 2])).toBeGreaterThan(0);
  });

  it('treats missing trailing entries as zero', () => {
    expect(comparePlacementCounts([1], [1, 0, 0])).toBe(0);
    expect(comparePlacementCounts([1], [1, 0, 1])).toBeLessThan(0);
    expect(comparePlacementCounts([], [])).toBe(0);
  });
});

describe('compareCountback', () => {
  it('uses Grand Prix countback before Sprint countback', () => {
    const grandPrixWin = countback([1], []);
    const moreSprintWins = countback([0], [5]);

    // The checked-in 2026 classification ranks Marini ahead of Binder on 108
    // points because of a Grand Prix fifth place, despite Binder's sprints.
    expect(compareCountback(grandPrixWin, moreSprintWins)).toBeGreaterThan(0);
    expect(compareCountback(moreSprintWins, grandPrixWin)).toBeLessThan(0);
  });

  it('falls through to Sprint countback when Grand Prix records match', () => {
    expect(
      compareCountback(countback([1, 2], [0, 4]), countback([1, 2], [0, 3])),
    ).toBeGreaterThan(0);
  });

  it('returns zero for equivalent countbacks with different array lengths', () => {
    expect(compareCountback(countback([1, 0]), countback([1], []))).toBe(0);
  });
});

describe('compareByPointsAndCountback', () => {
  it('sorts by points first, then countback', () => {
    expect(
      compareByPointsAndCountback(
        { points: 200, countback: countback([]) },
        { points: 190, countback: countback([9]) },
      ),
    ).toBeLessThan(0);

    expect(
      compareByPointsAndCountback(
        { points: 200, countback: countback([2]) },
        { points: 200, countback: countback([1, 9]) },
      ),
    ).toBeLessThan(0);
  });

  it('returns zero when points and countback are identical', () => {
    expect(
      compareByPointsAndCountback(
        { points: 100, countback: countback([1, 2], [3]) },
        { points: 100, countback: countback([1, 2], [3]) },
      ),
    ).toBe(0);
  });
});

describe('addFinishToCountback', () => {
  it('records a finish without mutating the input', () => {
    const original = countback([1, 0], [2]);
    const updated = addFinishToCountback(original, 'grandPrix', 2);

    expect(updated.grandPrix).toEqual([1, 1]);
    expect(updated.sprint).toEqual([2]);
    expect(original.grandPrix).toEqual([1, 0]);

    const sprint = addFinishToCountback(original, 'sprint', 1);
    expect(sprint.sprint).toEqual([3]);
    expect(sprint.grandPrix).toEqual([1, 0]);
    expect(original.sprint).toEqual([2]);
  });

  it('extends the placement array when a rider finishes deeper', () => {
    const updated = addFinishToCountback(countback([], []), 'grandPrix', 4);
    expect(updated.grandPrix).toEqual([0, 0, 0, 1]);
  });

  it('rejects invalid positions and event types', () => {
    expect(() => addFinishToCountback(countback([]), 'sprint', 0)).toThrow(
      RangeError,
    );
    expect(() =>
      addFinishToCountback(countback([]), 'qualifying' as EventType, 1),
    ).toThrow(TypeError);
  });
});
