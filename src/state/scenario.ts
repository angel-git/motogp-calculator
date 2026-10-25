import { pointsTable } from '../domain/scoring';
import type {
  Event,
  EventId,
  Rider,
  RiderId,
  Scenario,
  Season,
  ScoringRules,
  Standing,
} from '../domain/types';
import { ScenarioError } from '../domain/validation';

/**
 * Application state for the race editor.
 *
 * The editor keeps a contiguous run of rider IDs per event, from the winner
 * down. Position N is only editable once positions 1..N-1 are filled, which
 * means a draft can always be converted to the domain `Scenario` shape without
 * ambiguous gaps. The store is deliberately free of DOM APIs so the editing
 * rules can be unit tested.
 */

export type EventStatusKind = 'empty' | 'incomplete' | 'complete';

export interface EventStatus {
  kind: EventStatusKind;
  /** Number of positions assigned so far. */
  filledPositions: number;
  /** Number of scoring positions the session offers. */
  totalPositions: number;
  /** Compact label for the status chip. */
  label: string;
  /** Longer explanation for tooltips and assistive technology. */
  description: string;
  /** Whether the result currently contributes points to the projection. */
  simulated: boolean;
}

export interface ScenarioStore {
  /** Convert the current editor state into a domain scenario. */
  getScenario(): Scenario;
  /** Current finishing order for one event, from the winner onwards. */
  getEventResults(eventId: EventId): readonly RiderId[];
  /**
   * Assign a rider to a 1-based finishing position, or pass an empty string to
   * clear that position. Clearing a position also clears every position after
   * it so the result stays contiguous.
   *
   * @throws {ScenarioError} for an unknown event or rider, an out-of-range
   * position, a position that is not reachable yet, or a duplicate rider.
   */
  setPosition(eventId: EventId, position: number, riderId: RiderId | ''): void;
  /** Remove every result for one event. */
  clearEvent(eventId: EventId): void;
  /** Remove every result for every event. */
  clearAll(): void;
  /** Listen for state changes. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

/** Number of editable positions for an event, taken from its points table. */
export function positionCount(event: Event, scoring: ScoringRules): number {
  return pointsTable(event.type, scoring).length;
}

/**
 * Describe how complete an event's result is.
 *
 * Partial results are valid for the calculation engine and score only the
 * filled positions. The UI uses `kind` to make that state explicit rather than
 * pretending the session is fully simulated.
 */
export function getEventStatus(
  event: Event,
  result: readonly RiderId[],
  scoring: ScoringRules,
): EventStatus {
  const totalPositions = positionCount(event, scoring);
  const filledPositions = Math.min(result.length, totalPositions);

  if (filledPositions === 0) {
    return {
      kind: 'empty',
      filledPositions,
      totalPositions,
      label: 'Not simulated',
      description:
        'No positions filled, so this session awards no points in the projection.',
      simulated: false,
    };
  }

  if (filledPositions === totalPositions) {
    return {
      kind: 'complete',
      filledPositions,
      totalPositions,
      label: 'Complete',
      description:
        'All scoring positions are filled. The full classification scores in the projection.',
      simulated: true,
    };
  }

  return {
    kind: 'incomplete',
    filledPositions,
    totalPositions,
    label: `Incomplete · ${filledPositions}/${totalPositions}`,
    description: `Only the ${filledPositions} filled position${
      filledPositions === 1 ? '' : 's'
    } score. Fill the remaining positions for a full classification.`,
    simulated: true,
  };
}

/**
 * Riders for the editor dropdowns, ordered by their championship position at
 * the cutoff. Riders not expected to take part in the remaining rounds are
 * excluded by the caller.
 */
export function sortRidersByStanding(
  riders: readonly Rider[],
  standings: readonly Standing[],
): Rider[] {
  const positionByRider = new Map(
    standings.map((standing) => [standing.riderId, standing.position]),
  );

  return [...riders].sort((a, b) => {
    const aPosition = positionByRider.get(a.id) ?? Number.POSITIVE_INFINITY;
    const bPosition = positionByRider.get(b.id) ?? Number.POSITIVE_INFINITY;
    if (aPosition !== bPosition) {
      return aPosition - bPosition;
    }
    return a.shortName.localeCompare(b.shortName);
  });
}

/**
 * Whether a rider can be assigned to a position without appearing twice in the
 * same event. `position` is 1-based and may be beyond the current result.
 */
export function isRiderAvailableForPosition(
  result: readonly RiderId[],
  position: number,
  riderId: RiderId,
): boolean {
  const index = position - 1;
  return result.every((selected, selectedIndex) => {
    return selectedIndex === index || selected !== riderId;
  });
}

export function createScenarioStore(season: Season): ScenarioStore {
  const eventById = new Map(season.remainingEvents.map((event) => [event.id, event]));
  const knownRiderIds = new Set(season.riders.map((rider) => rider.id));
  const results = new Map<EventId, RiderId[]>();
  const listeners = new Set<() => void>();

  function emit(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  function getEventResults(eventId: EventId): readonly RiderId[] {
    return [...(results.get(eventId) ?? [])];
  }

  function setPosition(
    eventId: EventId,
    position: number,
    riderId: RiderId | '',
  ): void {
    const event = eventById.get(eventId);
    if (!event) {
      throw new ScenarioError([`Unknown event ID "${eventId}"`]);
    }

    const totalPositions = positionCount(event, season.scoring);
    if (!Number.isInteger(position) || position < 1 || position > totalPositions) {
      throw new ScenarioError([
        `Position ${position} is outside the editable range 1-${totalPositions} for event "${eventId}"`,
      ]);
    }

    if (riderId !== '' && !knownRiderIds.has(riderId)) {
      throw new ScenarioError([`Unknown rider ID "${riderId}"`]);
    }

    const current = results.get(eventId) ?? [];
    const index = position - 1;

    if (index > current.length) {
      throw new ScenarioError([
        `Position ${position} in event "${eventId}" cannot be filled before position ${current.length + 1}`,
      ]);
    }

    let next: RiderId[];

    if (riderId === '') {
      // Clearing a position also clears everything after it so the result
      // remains a contiguous finishing order.
      next = current.slice(0, index);
    } else if (index < current.length) {
      next = [...current];
      next[index] = riderId;
    } else {
      next = [...current, riderId];
    }

    if (riderId !== '') {
      const duplicate = next.some(
        (selected, selectedIndex) => selectedIndex !== index && selected === riderId,
      );
      if (duplicate) {
        throw new ScenarioError([
          `Rider "${riderId}" already occupies another position in event "${eventId}"`,
        ]);
      }
    }

    if (next.length === 0) {
      if (!results.has(eventId)) {
        return;
      }
      results.delete(eventId);
    } else {
      results.set(eventId, next);
    }

    emit();
  }

  function clearEvent(eventId: EventId): void {
    if (results.delete(eventId)) {
      emit();
    }
  }

  function clearAll(): void {
    if (results.size === 0) {
      return;
    }
    results.clear();
    emit();
  }

  function getScenario(): Scenario {
    const scenarioResults: Record<EventId, readonly RiderId[]> = {};

    // Use calendar order rather than Map insertion order so the scenario is
    // stable regardless of the order the user edited events in.
    for (const event of season.remainingEvents) {
      const result = results.get(event.id);
      if (result && result.length > 0) {
        scenarioResults[event.id] = [...result];
      }
    }

    return { results: scenarioResults };
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return {
    getScenario,
    getEventResults,
    setPosition,
    clearEvent,
    clearAll,
    subscribe,
  };
}
