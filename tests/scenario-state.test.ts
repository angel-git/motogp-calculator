import { describe, expect, it, vi } from 'vitest';
import { season2026 } from '../src/data/season';
import { calculateChampionship } from '../src/domain/championship';
import { ScenarioError } from '../src/domain/validation';
import {
  createScenarioStore,
  getEventStatus,
  isRiderAvailableForPosition,
  positionCount,
  sortRidersByStanding,
} from '../src/state/scenario';

const SPRINT = season2026.remainingEvents.find(
  (event) => event.type === 'sprint',
)!;
const GRAND_PRIX = season2026.remainingEvents.find(
  (event) => event.type === 'grandPrix',
)!;
const SPRINT_POSITIONS = positionCount(SPRINT, season2026.scoring);

function newStore() {
  return createScenarioStore(season2026);
}

describe('scenario store', () => {
  it('starts with an empty scenario', () => {
    const store = newStore();

    expect(store.getScenario()).toEqual({ results: {} });
    expect(store.getEventResults(SPRINT.id)).toEqual([]);
  });

  it('builds a finishing order from winner downwards', () => {
    const store = newStore();

    store.setPosition(SPRINT.id, 1, 'jorge-martin');
    store.setPosition(SPRINT.id, 2, 'marc-marquez');
    store.setPosition(SPRINT.id, 3, 'pedro-acosta');

    expect(store.getEventResults(SPRINT.id)).toEqual([
      'jorge-martin',
      'marc-marquez',
      'pedro-acosta',
    ]);
    expect(store.getScenario().results).toEqual({
      [SPRINT.id]: ['jorge-martin', 'marc-marquez', 'pedro-acosta'],
    });
  });

  it('returns copies rather than internal arrays', () => {
    const store = newStore();
    store.setPosition(SPRINT.id, 1, 'jorge-martin');

    const result = store.getEventResults(SPRINT.id) as string[];
    result.push('marc-marquez');

    expect(store.getEventResults(SPRINT.id)).toEqual(['jorge-martin']);
  });

  it('changes a filled position without clearing the positions after it', () => {
    const store = newStore();
    store.setPosition(SPRINT.id, 1, 'jorge-martin');
    store.setPosition(SPRINT.id, 2, 'marc-marquez');
    store.setPosition(SPRINT.id, 3, 'pedro-acosta');

    store.setPosition(SPRINT.id, 1, 'marco-bezzecchi');

    expect(store.getEventResults(SPRINT.id)).toEqual([
      'marco-bezzecchi',
      'marc-marquez',
      'pedro-acosta',
    ]);
  });

  it('clearing a position also clears every position after it', () => {
    const store = newStore();
    store.setPosition(SPRINT.id, 1, 'jorge-martin');
    store.setPosition(SPRINT.id, 2, 'marc-marquez');
    store.setPosition(SPRINT.id, 3, 'pedro-acosta');

    store.setPosition(SPRINT.id, 2, '');

    expect(store.getEventResults(SPRINT.id)).toEqual(['jorge-martin']);
  });

  it('does not let a rider occupy two positions in one event', () => {
    const store = newStore();
    store.setPosition(SPRINT.id, 1, 'jorge-martin');

    expect(() => store.setPosition(SPRINT.id, 2, 'jorge-martin')).toThrow(
      ScenarioError,
    );
    expect(store.getEventResults(SPRINT.id)).toEqual(['jorge-martin']);
  });

  it('allows the same rider to be used in different events', () => {
    const store = newStore();

    store.setPosition(SPRINT.id, 1, 'jorge-martin');
    store.setPosition(GRAND_PRIX.id, 1, 'jorge-martin');

    expect(store.getEventResults(SPRINT.id)).toEqual(['jorge-martin']);
    expect(store.getEventResults(GRAND_PRIX.id)).toEqual(['jorge-martin']);
  });

  it('rejects unknown events, unknown riders, and out-of-range positions', () => {
    const store = newStore();

    expect(() => store.setPosition('not-an-event', 1, 'jorge-martin')).toThrow(
      ScenarioError,
    );
    expect(() => store.setPosition(SPRINT.id, 1, 'not-a-rider')).toThrow(
      ScenarioError,
    );
    expect(() => store.setPosition(SPRINT.id, 0, 'jorge-martin')).toThrow(
      ScenarioError,
    );
    expect(() =>
      store.setPosition(SPRINT.id, SPRINT_POSITIONS + 1, 'jorge-martin'),
    ).toThrow(ScenarioError);
  });

  it('rejects filling a position before the preceding ones', () => {
    const store = newStore();

    expect(() => store.setPosition(SPRINT.id, 2, 'jorge-martin')).toThrow(
      ScenarioError,
    );
  });

  it('clears one event or every event', () => {
    const store = newStore();
    store.setPosition(SPRINT.id, 1, 'jorge-martin');
    store.setPosition(GRAND_PRIX.id, 1, 'marc-marquez');

    store.clearEvent(SPRINT.id);
    expect(store.getScenario().results).toEqual({
      [GRAND_PRIX.id]: ['marc-marquez'],
    });

    store.clearAll();
    expect(store.getScenario()).toEqual({ results: {} });
  });

  it('notifies subscribers on real changes only', () => {
    const store = newStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.setPosition(SPRINT.id, 1, 'jorge-martin');
    expect(listener).toHaveBeenCalledTimes(1);

    store.clearEvent(SPRINT.id);
    expect(listener).toHaveBeenCalledTimes(2);

    store.clearEvent(SPRINT.id);
    store.clearAll();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    store.setPosition(SPRINT.id, 1, 'jorge-martin');
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('event status', () => {
  it('reports not simulated, incomplete, and complete states', () => {
    expect(getEventStatus(SPRINT, [], season2026.scoring)).toMatchObject({
      kind: 'empty',
      filledPositions: 0,
      totalPositions: SPRINT_POSITIONS,
      simulated: false,
    });

    expect(
      getEventStatus(SPRINT, ['jorge-martin'], season2026.scoring),
    ).toMatchObject({
      kind: 'incomplete',
      filledPositions: 1,
      totalPositions: SPRINT_POSITIONS,
      simulated: true,
    });

    const fullResult = Array.from(
      { length: SPRINT_POSITIONS },
      (_, index) => `rider-${index + 1}`,
    );
    expect(getEventStatus(SPRINT, fullResult, season2026.scoring)).toMatchObject({
      kind: 'complete',
      filledPositions: SPRINT_POSITIONS,
      totalPositions: SPRINT_POSITIONS,
      simulated: true,
    });
  });

  it('uses the scoring table length for each event type', () => {
    expect(positionCount(SPRINT, season2026.scoring)).toBe(
      season2026.scoring.sprint.length,
    );
    expect(positionCount(GRAND_PRIX, season2026.scoring)).toBe(
      season2026.scoring.grandPrix.length,
    );
  });
});

describe('rider availability helpers', () => {
  it('treats a rider in another position as unavailable', () => {
    expect(
      isRiderAvailableForPosition(['jorge-martin'], 2, 'jorge-martin'),
    ).toBe(false);
    expect(
      isRiderAvailableForPosition(['jorge-martin'], 1, 'jorge-martin'),
    ).toBe(true);
    expect(
      isRiderAvailableForPosition(['jorge-martin'], 2, 'marc-marquez'),
    ).toBe(true);
  });

  it('orders riders by their cutoff championship position', () => {
    const riders = sortRidersByStanding(
      season2026.riders.filter((rider) => rider.availableForRemainingEvents),
      season2026.startingStandings,
    );

    expect(riders[0].id).toBe('marc-marquez');
    expect(riders[1].id).toBe('jorge-martin');
    expect(riders.every((rider) => rider.availableForRemainingEvents)).toBe(true);
  });
});

describe('scenario store with the championship engine', () => {
  it('recalculates the projection as positions change', () => {
    const store = newStore();

    store.setPosition(SPRINT.id, 1, 'jorge-martin');
    store.setPosition(SPRINT.id, 2, 'marc-marquez');

    const first = calculateChampionship(
      season2026.startingStandings,
      season2026.remainingEvents,
      store.getScenario(),
      season2026.scoring,
    );

    const marcFirst = first.standings.find(
      (standing) => standing.riderId === 'marc-marquez',
    );
    const jorgeFirst = first.standings.find(
      (standing) => standing.riderId === 'jorge-martin',
    );
    expect(marcFirst).toMatchObject({ simulatedPoints: 9, points: 374 });
    expect(jorgeFirst).toMatchObject({ simulatedPoints: 12, points: 367 });

    // Swapping two riders needs the second position cleared first, because a
    // rider is never allowed to appear twice in the same event.
    store.setPosition(SPRINT.id, 2, '');
    store.setPosition(SPRINT.id, 1, 'marc-marquez');
    store.setPosition(SPRINT.id, 2, 'jorge-martin');

    const second = calculateChampionship(
      season2026.startingStandings,
      season2026.remainingEvents,
      store.getScenario(),
      season2026.scoring,
    );

    expect(
      second.standings.find((standing) => standing.riderId === 'marc-marquez'),
    ).toMatchObject({ simulatedPoints: 12, points: 377 });
    expect(
      second.standings.find((standing) => standing.riderId === 'jorge-martin'),
    ).toMatchObject({ simulatedPoints: 9, points: 364 });
  });

  it('scores only filled positions of an incomplete event', () => {
    const store = newStore();
    store.setPosition(SPRINT.id, 1, 'jorge-martin');

    const projection = calculateChampionship(
      season2026.startingStandings,
      season2026.remainingEvents,
      store.getScenario(),
      season2026.scoring,
    );

    expect(projection.simulatedEvents).toEqual([SPRINT.id]);
    expect(
      projection.standings.find(
        (standing) => standing.riderId === 'jorge-martin',
      ),
    ).toMatchObject({ simulatedPoints: 12, points: 367 });
    expect(
      projection.standings.reduce(
        (total, standing) => total + standing.simulatedPoints,
        0,
      ),
    ).toBe(12);
  });

  it('projects multiple events through the store', () => {
    const store = newStore();
    store.setPosition(SPRINT.id, 1, 'jorge-martin');
    store.setPosition(SPRINT.id, 2, 'marc-marquez');
    store.setPosition(GRAND_PRIX.id, 1, 'marc-marquez');
    store.setPosition(GRAND_PRIX.id, 2, 'jorge-martin');

    const projection = calculateChampionship(
      season2026.startingStandings,
      season2026.remainingEvents,
      store.getScenario(),
      season2026.scoring,
    );

    expect(projection.champion.riderId).toBe('marc-marquez');
    expect(projection.pointsGap).toBe(12);
    expect(
      projection.standings.find(
        (standing) => standing.riderId === 'marc-marquez',
      ),
    ).toMatchObject({ simulatedPoints: 34, points: 399 });
  });
});
