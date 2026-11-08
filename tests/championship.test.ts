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
    expect(projection.pointsGap).toBe(60);
    expect(projection.championClinched).toBe(false);
  });

  it('projects a manually verified 2026 scenario', () => {
    const projection = calculateChampionship(
      season2026.startingStandings,
      season2026.remainingEvents,
      {
        results: {
          '2026-21-portugal-sprint': ['jorge-martin', 'marc-marquez'],
          '2026-21-portugal-grand-prix': ['marc-marquez', 'jorge-martin'],
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

    // Marc: 431 + 9 (Sprint P2) + 25 (GP win) = 465.
    // Jorge: 371 + 12 (Sprint win) + 20 (GP P2) = 403.
    expect(marc).toMatchObject({
      position: 1,
      startingPoints: 431,
      simulatedPoints: 34,
      points: 465,
    });
    expect(jorge).toMatchObject({
      position: 2,
      startingPoints: 371,
      simulatedPoints: 32,
      points: 403,
    });
    expect(projection.champion.riderId).toBe('marc-marquez');
    expect(projection.pointsGap).toBe(62);
    expect(projection.simulatedEvents).toEqual([
      '2026-21-portugal-sprint',
      '2026-21-portugal-grand-prix',
    ]);
  });

  it('does not clinch while a rival can still overtake the leader', () => {
    const projection = projectionFor(
      [standing(1, 'a', 100), standing(2, 'b', 90)],
      [event('gp-1', 'grandPrix')],
      {},
    );

    expect(projection.championClinched).toBe(false);
  });

  it('clinches when no rival can reach the leader', () => {
    const projection = projectionFor(
      [standing(1, 'a', 100), standing(2, 'b', 74)],
      [event('gp-1', 'grandPrix')],
      {},
    );

    // b can only reach 99 points with a Grand Prix win.
    expect(projection.championClinched).toBe(true);
  });

  it('does not clinch when a rival could tie the leader on points', () => {
    const projection = projectionFor(
      [standing(1, 'a', 100), standing(2, 'b', 75)],
      [event('gp-1', 'grandPrix')],
      {},
    );

    // A tie is decided on countback, and b's win in the remaining Grand Prix
    // would give them the tie-break against a's empty record.
    expect(projection.championClinched).toBe(false);
  });

  it('clinches when the leader wins a points tie on countback', () => {
    const projection = projectionFor(
      [
        standing(1, 'a', 100, { grandPrix: [2], sprint: [] }),
        standing(2, 'b', 75),
      ],
      [event('gp-1', 'grandPrix')],
      {},
    );

    // b can tie on 100 points, but the remaining win only gives them one
    // Grand Prix win against a's two.
    expect(projection.champion.riderId).toBe('a');
    expect(projection.championClinched).toBe(true);
  });

  it('clinches after the final event when the leader wins the tie-break', () => {
    const projection = projectionFor(
      [
        standing(1, 'a', 100, { grandPrix: [1], sprint: [] }),
        standing(2, 'b', 100),
      ],
      [],
      {},
    );

    // With no sessions left, b can only tie and a keeps the title on countback.
    expect(projection.champion.riderId).toBe('a');
    expect(projection.championClinched).toBe(true);
  });

  it('counts every open position as still available', () => {
    const projection = projectionFor(
      [standing(1, 'a', 100), standing(2, 'b', 90)],
      [event('gp-1', 'grandPrix'), event('sprint-1', 'sprint')],
      { 'gp-1': ['a'] },
    );

    // a leads 125-90. b can still take the Grand Prix's open second place (20)
    // and win the Sprint (12) for 122, which is still short of a's 125.
    expect(projection.championClinched).toBe(true);
  });

  it('does not clinch while unfilled positions remain in simulated sessions', () => {
    // Jorge wins every remaining session, but only the winner is filled in.
    // Marc can still take second place in those same sessions, which would
    // give him enough points to take the title, so Jorge is not a
    // mathematical champion yet.
    const projection = calculateChampionship(
      season2026.startingStandings,
      season2026.remainingEvents,
      {
        results: {
          '2026-21-portugal-sprint': ['jorge-martin'],
          '2026-21-portugal-grand-prix': ['jorge-martin'],
          '2026-22-valencia-sprint': ['jorge-martin'],
          '2026-22-valencia-grand-prix': ['jorge-martin'],
        },
      },
      season2026.scoring,
    );

    expect(projection.champion.riderId).toBe('jorge-martin');
    expect(projection.champion.points).toBe(445);
    expect(projection.championClinched).toBe(false);

    // Filling second place for Marc in one Grand Prix is enough to put him
    // ahead, which is exactly why Jorge cannot be crowned yet.
    const marcSecond = calculateChampionship(
      season2026.startingStandings,
      season2026.remainingEvents,
      {
        results: {
          '2026-21-portugal-sprint': ['jorge-martin'],
          '2026-21-portugal-grand-prix': ['jorge-martin', 'marc-marquez'],
          '2026-22-valencia-sprint': ['jorge-martin'],
          '2026-22-valencia-grand-prix': ['jorge-martin'],
        },
      },
      season2026.scoring,
    );

    expect(marcSecond.champion.riderId).toBe('marc-marquez');
    expect(marcSecond.champion.points).toBe(451);
  });

  it('clinches once every scoring position of the remaining sessions is filled', () => {
    // Every session is complete, so no result can change any more. Jorge wins
    // all four and, with the lower places taken by the riders furthest behind,
    // is now guaranteed the title.
    const ridersFurthestBehind = [...season2026.startingStandings]
      .filter((entry) => entry.riderId !== 'jorge-martin')
      .sort(
        (a, b) => a.points - b.points || a.position - b.position,
      )
      .map((entry) => entry.riderId);
    const grandPrixOrder = [
      'jorge-martin',
      ...ridersFurthestBehind.slice(0, 14),
    ];
    const sprintOrder = ['jorge-martin', ...ridersFurthestBehind.slice(0, 8)];

    const projection = calculateChampionship(
      season2026.startingStandings,
      season2026.remainingEvents,
      {
        results: {
          '2026-21-portugal-sprint': sprintOrder,
          '2026-21-portugal-grand-prix': grandPrixOrder,
          '2026-22-valencia-sprint': sprintOrder,
          '2026-22-valencia-grand-prix': grandPrixOrder,
        },
      },
      season2026.scoring,
    );

    expect(projection.champion.riderId).toBe('jorge-martin');
    expect(projection.championClinched).toBe(true);
  });

  it('does not clinch while an unfilled position can still outscore the leader', () => {
    const projection = projectionFor(
      [standing(1, 'a', 100), standing(2, 'b', 90)],
      [event('gp-1', 'grandPrix'), event('gp-2', 'grandPrix')],
      { 'gp-1': ['a'] },
    );

    // a wins the partly filled first Grand Prix (125), but b can still take
    // second there (+20) and win the second race (+25) for 135. Treating the
    // unfilled place as settled would wrongly crown a.
    expect(projection.champion.riderId).toBe('a');
    expect(projection.championClinched).toBe(false);
  });

  it('clinches after the leader wins the next Sprint and Grand Prix', () => {
    const clinched = calculateChampionship(
      season2026.startingStandings,
      season2026.remainingEvents,
      {
        results: {
          '2026-21-portugal-sprint': ['marc-marquez'],
          '2026-21-portugal-grand-prix': ['marc-marquez'],
        },
      },
      season2026.scoring,
    );

    expect(clinched.champion.riderId).toBe('marc-marquez');
    expect(clinched.champion.points).toBe(468);
    expect(clinched.championClinched).toBe(true);

    const before = calculateChampionship(
      season2026.startingStandings,
      season2026.remainingEvents,
      { results: {} },
      season2026.scoring,
    );
    expect(before.championClinched).toBe(false);
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
    expect(projection.championClinched).toBe(true);
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
