import { scoreEvent } from './scoring';
import { addFinishToCountback, compareByPointsAndCountback } from './tiebreak';
import type {
  ChampionshipProjection,
  ChampionshipStanding,
  Countback,
  Event,
  EventId,
  RiderId,
  Scenario,
  ScoringRules,
  Standing,
} from './types';
import { ScenarioError, validateScenarioResults } from './validation';

interface Accumulator {
  riderId: RiderId;
  startingPosition: number;
  startingPoints: number;
  simulatedPoints: number;
  countback: Countback;
}

function totalPoints(accumulator: Accumulator): number {
  return accumulator.startingPoints + accumulator.simulatedPoints;
}

function compareAccumulators(a: Accumulator, b: Accumulator): number {
  const byPointsAndCountback = compareByPointsAndCountback(
    { points: totalPoints(a), countback: a.countback },
    { points: totalPoints(b), countback: b.countback },
  );
  if (byPointsAndCountback !== 0) {
    return byPointsAndCountback;
  }

  // The official countback cannot separate these riders with the data we
  // model. Keep the cutoff order, then fall back to the rider ID so the
  // projection is deterministic. A future data update can add the missing
  // results if a real tie needs a deeper tie-break.
  if (a.startingPosition !== b.startingPosition) {
    return a.startingPosition - b.startingPosition;
  }
  return a.riderId.localeCompare(b.riderId);
}

/**
 * Project the championship from official starting standings plus a scenario.
 *
 * The function is pure: it does not read the DOM, browser storage, or the
 * network, and it does not mutate its arguments.
 *
 * Rules modelled:
 * - Starting points are counted exactly once.
 * - Only events present in `scenario.results` score; absent events award
 *   nothing and are treated as "not simulated yet".
 * - Partial results are allowed. Only the listed positions score, so an
 *   unfilled position awards no points to anybody.
 * - Sprint and Grand Prix results use their own points tables.
 * - Countback is updated with every listed finish and used to break ties.
 *
 * An invalid scenario (unknown event or rider, duplicate rider, empty rider
 * ID) throws instead of producing a misleading projection.
 *
 * @throws {ScenarioError} when the scenario references invalid data.
 * @throws {RangeError} when there are no starting standings.
 */
export function calculateChampionship(
  startingStandings: readonly Standing[],
  events: readonly Event[],
  scenario: Scenario,
  scoringRules: ScoringRules,
): ChampionshipProjection {
  if (startingStandings.length === 0) {
    throw new RangeError('Cannot calculate a championship without starting standings');
  }

  const issues = validateScenarioResults(
    events,
    startingStandings.map((standing) => standing.riderId),
    scenario,
  );
  if (issues.length > 0) {
    throw new ScenarioError(issues);
  }

  const accumulators = new Map<RiderId, Accumulator>();
  for (const standing of startingStandings) {
    accumulators.set(standing.riderId, {
      riderId: standing.riderId,
      startingPosition: standing.position,
      startingPoints: standing.points,
      simulatedPoints: 0,
      countback: {
        grandPrix: [...standing.countback.grandPrix],
        sprint: [...standing.countback.sprint],
      },
    });
  }

  const simulatedEvents: EventId[] = [];

  // Iterate the calendar rather than the scenario object so event order and
  // duplicate handling do not depend on object key insertion order.
  for (const event of events) {
    if (!Object.prototype.hasOwnProperty.call(scenario.results, event.id)) {
      continue;
    }

    const finishingOrder = scenario.results[event.id];
    if (!Array.isArray(finishingOrder) || finishingOrder.length === 0) {
      // An explicitly empty result is treated as not simulated yet.
      continue;
    }

    simulatedEvents.push(event.id);
    const finishes = scoreEvent(event.type, finishingOrder, scoringRules);

    for (const finish of finishes) {
      const accumulator = accumulators.get(finish.riderId);
      if (!accumulator) {
        // validateScenarioResults already rejected unknown riders; this guard
        // keeps the engine safe if the two code paths ever diverge.
        throw new ScenarioError([
          `Unknown rider ID "${finish.riderId}" in event "${event.id}"`,
        ]);
      }

      accumulator.simulatedPoints += finish.points;
      accumulator.countback = addFinishToCountback(
        accumulator.countback,
        event.type,
        finish.position,
      );
    }
  }

  const standings: ChampionshipStanding[] = [...accumulators.values()]
    .sort(compareAccumulators)
    .map((accumulator, index) => {
      const position = index + 1;
      return {
        position,
        riderId: accumulator.riderId,
        points: totalPoints(accumulator),
        countback: accumulator.countback,
        startingPosition: accumulator.startingPosition,
        startingPoints: accumulator.startingPoints,
        simulatedPoints: accumulator.simulatedPoints,
        positionChange: accumulator.startingPosition - position,
      };
    });

  const champion = standings[0];
  const runnerUp = standings[1] ?? null;

  return {
    standings,
    champion,
    runnerUp,
    pointsGap: runnerUp ? champion.points - runnerUp.points : 0,
    simulatedEvents,
  };
}
