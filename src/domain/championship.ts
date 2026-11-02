import { pointsTable, scoreEvent } from './scoring';
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

interface RankedRider {
  riderId: RiderId;
  startingPosition: number;
  points: number;
  countback: Countback;
}

function compareRankedRiders(a: RankedRider, b: RankedRider): number {
  const byPointsAndCountback = compareByPointsAndCountback(a, b);
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

function compareAccumulators(a: Accumulator, b: Accumulator): number {
  return compareRankedRiders(
    {
      riderId: a.riderId,
      startingPosition: a.startingPosition,
      points: totalPoints(a),
      countback: a.countback,
    },
    {
      riderId: b.riderId,
      startingPosition: b.startingPosition,
      points: totalPoints(b),
      countback: b.countback,
    },
  );
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
 * - Partial results are allowed. Only the filled positions score, so an
 *   unfilled position awards no points to anybody while positions after a gap
 *   keep their true finishing place.
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
    if (
      !Array.isArray(finishingOrder) ||
      !finishingOrder.some((riderId) => riderId !== null)
    ) {
      // An empty result, or one with only unfilled positions, is treated as
      // not simulated yet.
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

  // Every unsimulated session can still be won by any rival, so a rival's
  // maximum possible total is their current points plus the winner's points
  // from every remaining session. Reaching that maximum means winning every
  // remaining session, which also fixes the rival's countback. The leader is
  // only safe when no rival can overtake them on points, nor tie them and win
  // the countback tie-break.
  const simulatedEventIds = new Set(simulatedEvents);
  const remainingEvents = events.filter(
    (event) => !simulatedEventIds.has(event.id),
  );
  const maxRemainingPoints = remainingEvents.reduce(
    (total, event) => total + (pointsTable(event.type, scoringRules)[0] ?? 0),
    0,
  );

  const championClinched = standings.slice(1).every((rival) => {
    const rivalMaximum = rival.points + maxRemainingPoints;
    if (rivalMaximum !== champion.points) {
      return rivalMaximum < champion.points;
    }

    // The rival can only tie on points by winning every remaining session.
    // Compare the resulting countbacks, falling back to the same cutoff and
    // rider-ID order used to sort the standings.
    const rivalCountback = remainingEvents.reduce(
      (countback, event) => addFinishToCountback(countback, event.type, 1),
      rival.countback,
    );

    return (
      compareRankedRiders(champion, {
        riderId: rival.riderId,
        startingPosition: rival.startingPosition,
        points: rivalMaximum,
        countback: rivalCountback,
      }) < 0
    );
  });

  return {
    standings,
    champion,
    runnerUp,
    pointsGap: runnerUp ? champion.points - runnerUp.points : 0,
    championClinched,
    simulatedEvents,
  };
}
