import type { EventType, RiderId, ScoringRules } from './types';

/** Thrown when a result or points table cannot be scored. */
export class ScoringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScoringError';
  }
}

export interface ScoredFinish {
  riderId: RiderId;
  /** 1-based finishing position. */
  position: number;
  points: number;
}

/**
 * Return the configured points table for an event type.
 *
 * @throws {ScoringError} for an unknown event type.
 */
export function pointsTable(
  eventType: EventType,
  rules: ScoringRules,
): readonly number[] {
  switch (eventType) {
    case 'sprint':
      return rules.sprint;
    case 'grandPrix':
      return rules.grandPrix;
    default:
      throw new ScoringError(`Unknown event type "${String(eventType)}"`);
  }
}

/**
 * Award points for one finishing position.
 *
 * Positions outside the configured scoring range score nothing. This is
 * deliberate: a rider classified 16th in a Grand Prix or 10th in a Sprint does
 * not score, and the caller should not need to special-case that.
 *
 * @param position 1-based finishing position.
 * @throws {RangeError} when the position is not a positive integer.
 * @throws {ScoringError} for an unknown event type.
 */
export function pointsForPosition(
  eventType: EventType,
  position: number,
  rules: ScoringRules,
): number {
  if (!Number.isInteger(position) || position < 1) {
    throw new RangeError(
      `Finishing position must be a positive integer; received ${position}`,
    );
  }

  return pointsTable(eventType, rules)[position - 1] ?? 0;
}

/**
 * Score a complete or partial finishing order.
 *
 * Every listed position is returned, including positions outside the scoring
 * range (with zero points), because countback uses the full classification.
 * Duplicate riders are rejected rather than scored twice.
 *
 * @throws {ScoringError} for duplicate riders or an unknown event type.
 */
export function scoreEvent(
  eventType: EventType,
  finishingOrder: readonly RiderId[],
  rules: ScoringRules,
): ScoredFinish[] {
  const seenRiderIds = new Set<RiderId>();

  return finishingOrder.map((riderId, index) => {
    if (riderId.trim() === '') {
      throw new ScoringError(`Finishing position ${index + 1} has an empty rider ID`);
    }
    if (seenRiderIds.has(riderId)) {
      throw new ScoringError(
        `Rider "${riderId}" appears more than once in the same event`,
      );
    }
    seenRiderIds.add(riderId);

    const position = index + 1;
    return {
      riderId,
      position,
      points: pointsForPosition(eventType, position, rules),
    };
  });
}
