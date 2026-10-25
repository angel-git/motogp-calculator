import type { Countback, EventType } from './types';

/**
 * Compare two placement-count arrays lexicographically.
 *
 * Index 0 counts wins, index 1 second places, and so on. Missing trailing
 * entries count as zero. Returns a positive number when `a` is better, a
 * negative number when `b` is better, and zero when they are equivalent.
 */
export function comparePlacementCounts(
  a: readonly number[],
  b: readonly number[],
): number {
  const length = Math.max(a.length, b.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

/**
 * Compare countback data using the championship order.
 *
 * Grand Prix countback is compared first, then Sprint countback. The official
 * classification is split in the same way, and it places Marini ahead of
 * Binder on 108 points because of a Grand Prix fifth place, regardless of
 * Binder's stronger Sprint record. A rider who is ahead on the first countback
 * array wins the tie even if the other rider has better Sprint results.
 *
 * Returns a positive number when `a` is better, negative when `b` is better,
 * and zero when both countbacks are equivalent.
 */
export function compareCountback(a: Countback, b: Countback): number {
  return (
    comparePlacementCounts(a.grandPrix, b.grandPrix) ||
    comparePlacementCounts(a.sprint, b.sprint)
  );
}

/**
 * Sort comparator for riders on equal points.
 *
 * Returns a negative number when `a` should appear first, matching
 * `Array.prototype.sort`.
 */
export function compareByPointsAndCountback(
  a: { points: number; countback: Countback },
  b: { points: number; countback: Countback },
): number {
  if (a.points !== b.points) {
    return b.points - a.points;
  }

  const countbackDifference = compareCountback(a.countback, b.countback);
  return countbackDifference === 0 ? 0 : -countbackDifference;
}

function incrementPlacement(
  placements: readonly number[],
  position: number,
): number[] {
  const next = [...placements];
  while (next.length < position) {
    next.push(0);
  }
  next[position - 1] += 1;
  return next;
}

/**
 * Record one simulated finish in a rider's countback totals.
 *
 * The input is not mutated. Arrays grow when a rider is classified deeper than
 * the cutoff data recorded, so simulated results can extend the countback.
 *
 * @param position 1-based finishing position.
 * @throws {RangeError} when the position is not a positive integer.
 * @throws {TypeError} for an unknown event type.
 */
export function addFinishToCountback(
  countback: Countback,
  eventType: EventType,
  position: number,
): Countback {
  if (!Number.isInteger(position) || position < 1) {
    throw new RangeError(
      `Finishing position must be a positive integer; received ${position}`,
    );
  }

  switch (eventType) {
    case 'grandPrix':
      return {
        grandPrix: incrementPlacement(countback.grandPrix, position),
        sprint: [...countback.sprint],
      };
    case 'sprint':
      return {
        grandPrix: [...countback.grandPrix],
        sprint: incrementPlacement(countback.sprint, position),
      };
    default:
      throw new TypeError(`Unknown event type "${String(eventType)}"`);
  }
}
