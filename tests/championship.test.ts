import { describe, expect, it } from 'vitest';
import { season2026 } from '../src/data/season';
import { calculateChampionship } from '../src/domain/championship';
import type {
  Countback,
  Event,
  EventType,
  ScoringRules,
  Standing,
} from '../src/domain/types';
import { ScenarioError } from '../src/domain/validation';

const RULES: ScoringRules = {
  grandPrix: [25, 20, 16, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
  sprint: [12, 9, 7, 6, 5, 4, 3, 2, 1],
};

const NO_COUNTBACK: Countback = { grandPrix: [], sprint: [] };

function standing(
  position: number,
  riderId: string,
  points: number,
  countback: Countback = NO_COUNTBACK,
): Standing {
  return { position, riderId, points, countback };
}

function event(id: string, type: EventType, round = 1): Event {
  return {
    id,
    round,
    name: 'Test Grand Prix',
    circuit: 'Test Circuit',
    country: 'Testland',
    date: '2026-11-01',
    type,
  };
}

function projectionFor(
  standings: readonly Standing[],
  events: readonly Event[],
  results: Record<string, readonly (string | null)[]>,
) {
  return calculateChampionship(standings, events, { results }, RULES);
}

describe('calculateChampionship', () => {
  it('adds Sprint and Grand Prix points to the starting totals exactly once', () => {
    const standings = [standing(1, 'a', 100), standing(2, 'b', 90)];
    const events = [event('sprint-1', 'sprint'), event('gp-1', 'grandPrix')];

    const projection = projectionFor(standings, events, {
      'sprint-1': ['a'],
      'gp-1': ['a', 'b'],
    });

    const a = projection.standings.find((entry) => entry.riderId === 'a');
    const b = projection.standings.find((entry) => entry.riderId === 'b');

    expect(a).toMatchObject({
      startingPoints: 100,
      simulatedPoints: 37,
      points: 137,
    });
    expect(b).toMatchObject({
      startingPoints: 90,
      simulatedPoints: 20,
      points: 110,
    });
    expect(projection.champion.riderId).toBe('a');
    expect(projection.runnerUp?.riderId).toBe('b');
    expect(projection.pointsGap).toBe(27);
    expect(projection.simulatedEvents).toEqual(['sprint-1', 'gp-1']);
  });

  it('uses separate Sprint and Grand Prix points', () => {
    const standings = [standing(1, 'a', 100), standing(2, 'b', 90)];
    const events = [event('sprint-1', 'sprint'), event('gp-1', 'grandPrix')];

    const projection = projectionFor(standings, events, {
      'sprint-1': ['a'],
      'gp-1': ['b'],
    });

    expect(
      projection.standings.find((entry) => entry.riderId === 'a')?.points,
    ).toBe(112);
    expect(
      projection.standings.find((entry) => entry.riderId === 'b')?.points,
    ).toBe(115);
    expect(projection.champion.riderId).toBe('b');
    expect(projection.pointsGap).toBe(3);
  });

  it('scores only the listed positions of a partial result', () => {
    const standings = [standing(1, 'a', 100), standing(2, 'b', 90)];
    const events = [event('gp-1', 'grandPrix')];

    const projection = projectionFor(standings, events, {
      // Second place is deliberately unfilled, so nobody scores for it.
      'gp-1': ['a'],
    });

    expect(
      projection.standings.find((entry) => entry.riderId === 'a'),
    ).toMatchObject({ simulatedPoints: 25, points: 125 });
    expect(
      projection.standings.find((entry) => entry.riderId === 'b'),
    ).toMatchObject({ simulatedPoints: 0, points: 90 });
  });

  it('keeps the finishing position of riders after an unfilled slot', () => {
    const standings = [standing(1, 'a', 100), standing(2, 'b', 90)];
    const events = [event('gp-1', 'grandPrix')];

    const projection = projectionFor(standings, events, {
      // First place is unfilled, so the listed rider is classified second.
      'gp-1': [null, 'a'],
    });

    expect(
      projection.standings.find((entry) => entry.riderId === 'a'),
    ).toMatchObject({ simulatedPoints: 20, points: 120 });
    expect(
      projection.standings.find((entry) => entry.riderId === 'b'),
    ).toMatchObject({ simulatedPoints: 0, points: 90 });
    expect(projection.simulatedEvents).toEqual(['gp-1']);
  });

  it('awards nothing for unsimulated or empty events', () => {
    const standings = [standing(1, 'a', 100), standing(2, 'b', 90)];
    const events = [event('sprint-1', 'sprint'), event('gp-1', 'grandPrix')];

    const projection = projectionFor(standings, events, {
      'gp-1': [],
      'sprint-1': [null, null],
    });

    expect(projection.simulatedEvents).toEqual([]);
    expect(projection.standings.every((entry) => entry.simulatedPoints === 0)).toBe(
      true,
    );
    expect(projection.champion.points).toBe(100);
    expect(projection.pointsGap).toBe(10);
  });

  it('reports position changes relative to the cutoff', () => {
    const standings = [
      standing(1, 'a', 113),
      standing(2, 'b', 100),
      standing(3, 'c', 50),
    ];
    const events = [event('sprint-1', 'sprint'), event('gp-1', 'grandPrix')];

    // A wins the Sprint (+12) while B wins the Grand Prix (+25). Both finish
    // on 125, and B wins the title on Grand Prix countback, so A loses a place.
    const projection = projectionFor(standings, events, {
      'sprint-1': ['a'],
      'gp-1': ['b'],
    });

    expect(projection.standings.map((entry) => entry.riderId)).toEqual([
      'b',
      'a',
      'c',
    ]);
    expect(
      projection.standings.map((entry) => entry.positionChange),
    ).toEqual([1, -1, 0]);
    expect(projection.champion.riderId).toBe('b');
    expect(projection.pointsGap).toBe(0);
  });

  it('uses updated countback to separate riders on equal points', () => {
    const standings = [
      standing(1, 'a', 100, { grandPrix: [0, 1], sprint: [] }),
      standing(2, 'b', 95, { grandPrix: [0, 1], sprint: [] }),
    ];
    const events = [event('gp-1', 'grandPrix')];

    const projection = projectionFor(standings, events, {
      'gp-1': ['b', 'a'],
    });

    // Both finish on 120 points, but b's simulated win breaks the countback
    // tie even though their starting countback records were identical.
    expect(
      projection.standings.find((entry) => entry.riderId === 'b')?.countback
        .grandPrix,
    ).toEqual([1, 1]);
    expect(
      projection.standings.find((entry) => entry.riderId === 'a')?.countback
        .grandPrix,
    ).toEqual([0, 2]);
    expect(projection.champion.riderId).toBe('b');
    expect(projection.pointsGap).toBe(0);
  });

  it('preserves the cutoff order when nothing is simulated', () => {
    const projection = calculateChampionship(
      season2026.startingStandings,
      season2026.remainingEvents,
      { results: {} },
      season2026.scoring,
    );

    expect(projection.standings.map((entry) => entry.riderId)).toEqual(
      season2026.startingStandings.map((entry) => entry.riderId),
    );
    expect(projection.standings.map((entry) => entry.points)).toEqual(
      season2026.startingStandings.map((entry) => entry.points),
    );
    expect(projection.simulatedEvents).toEqual([]);
    expect(projection.champion.riderId).toBe('marc-marquez');
    expect(projection.runnerUp?.riderId).toBe('jorge-martin');
    expect(projection.pointsGap).toBe(10);
  });

  it('projects a manually verified 2026 scenario', () => {
    const projection = calculateChampionship(
      season2026.startingStandings,
      season2026.remainingEvents,
      {
        results: {
          '2026-19-malaysia-sprint': ['jorge-martin', 'marc-marquez'],
          '2026-19-malaysia-grand-prix': ['marc-marquez', 'jorge-martin'],
        },
      },
      season2026.scoring,
    );

    const marc = projection.standings.find(
      (entry) => entry.riderId === 'marc-marquez',
    );
    const jorge = projection.standings.find(
      (entry) => entry.riderId === 'jorge-martin',
    );

    // Marc: 365 + 9 (Sprint P2) + 25 (GP win) = 399.
    // Jorge: 355 + 12 (Sprint win) + 20 (GP P2) = 387.
    expect(marc).toMatchObject({
      position: 1,
      startingPoints: 365,
      simulatedPoints: 34,
      points: 399,
    });
    expect(jorge).toMatchObject({
      position: 2,
      startingPoints: 355,
      simulatedPoints: 32,
      points: 387,
    });
    expect(projection.champion.riderId).toBe('marc-marquez');
    expect(projection.pointsGap).toBe(12);
    expect(projection.simulatedEvents).toEqual([
      '2026-19-malaysia-sprint',
      '2026-19-malaysia-grand-prix',
    ]);
  });

  it('supports a single-rider championship', () => {
    const projection = projectionFor(
      [standing(1, 'a', 10)],
      [event('gp-1', 'grandPrix')],
      { 'gp-1': ['a'] },
    );

    expect(projection.champion.points).toBe(35);
    expect(projection.runnerUp).toBeNull();
    expect(projection.pointsGap).toBe(0);
  });

  it('rejects an empty championship', () => {
    expect(() =>
      calculateChampionship([], [], { results: {} }, RULES),
    ).toThrow(RangeError);
  });
});

describe('calculateChampionship scenario validation', () => {
  const standings = [standing(1, 'a', 100), standing(2, 'b', 90)];
  const events = [event('gp-1', 'grandPrix')];

  it('rejects duplicate riders in one event', () => {
    expect(() =>
      projectionFor(standings, events, { 'gp-1': ['a', 'a'] }),
    ).toThrow(ScenarioError);
  });

  it('rejects unknown riders', () => {
    expect(() =>
      projectionFor(standings, events, { 'gp-1': ['not-a-rider'] }),
    ).toThrow(ScenarioError);
  });

  it('rejects unknown events', () => {
    expect(() =>
      projectionFor(standings, events, { 'not-an-event': ['a'] }),
    ).toThrow(ScenarioError);
  });

  it('reports every issue it finds', () => {
    try {
      projectionFor(standings, events, {
        'gp-1': ['a', 'a', 'not-a-rider'],
        'not-an-event': ['a'],
      });
      expect.unreachable('expected ScenarioError');
    } catch (error) {
      expect(error).toBeInstanceOf(ScenarioError);
      expect((error as ScenarioError).issues).toHaveLength(3);
    }
  });
});
