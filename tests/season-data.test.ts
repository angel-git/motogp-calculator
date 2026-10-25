import { describe, expect, it } from 'vitest';
import { season2026 } from '../src/data/season';
import {
  parseSeason,
  SeasonDataError,
  validateScenario,
} from '../src/domain/validation';

type MutableSeasonData = Record<string, any>;

function cloneSeasonData(): MutableSeasonData {
  return JSON.parse(JSON.stringify(season2026)) as MutableSeasonData;
}

function issuesFor(data: unknown): string[] {
  try {
    parseSeason(data);
    return [];
  } catch (error) {
    if (error instanceof SeasonDataError) {
      return [...error.issues];
    }
    throw error;
  }
}

describe('2026 season data', () => {
  it('loads and passes validation', () => {
    expect(season2026.year).toBe(2026);
    expect(season2026.riders).toHaveLength(32);
    expect(season2026.startingStandings).toHaveLength(32);
    expect(season2026.remainingEvents).toHaveLength(8);
  });

  it('uses the official Sprint and Grand Prix points tables', () => {
    expect(season2026.scoring.grandPrix).toEqual([
      25, 20, 16, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
    ]);
    expect(season2026.scoring.sprint).toEqual([12, 9, 7, 6, 5, 4, 3, 2, 1]);
  });

  it('records the standings cutoff and sources', () => {
    expect(season2026.meta.standingsCutoff).toBe('2026-10-24');
    expect(season2026.meta.standingsCutoffRound).toBe(18);
    expect(season2026.meta.standingsSource).toContain('resources.motogp.com');
    expect(season2026.meta.calendarSource).toContain('motogp.com');
  });

  it('matches the official standings at the cutoff', () => {
    const standings = new Map(
      season2026.startingStandings.map((standing) => [standing.riderId, standing]),
    );

    expect(standings.get('marc-marquez')).toMatchObject({ position: 1, points: 365 });
    expect(standings.get('jorge-martin')).toMatchObject({ position: 2, points: 355 });
    expect(standings.get('marco-bezzecchi')).toMatchObject({ position: 3, points: 315 });
    expect(standings.get('pedro-acosta')).toMatchObject({ position: 4, points: 263 });
    expect(standings.get('ai-ogura')).toMatchObject({ position: 5, points: 259 });

    // The official classification puts Marini ahead of Binder on countback.
    expect(standings.get('luca-marini')).toMatchObject({ position: 12, points: 108 });
    expect(standings.get('brad-binder')).toMatchObject({ position: 13, points: 108 });
  });

  it('marks the expected line-up for the remaining rounds', () => {
    const byId = new Map(season2026.riders.map((rider) => [rider.id, rider]));

    expect(season2026.riders.filter((rider) => rider.availableForRemainingEvents)).toHaveLength(
      21,
    );
    expect(byId.get('fermin-aldeguer')?.availableForRemainingEvents).toBe(true);
    expect(byId.get('augusto-fernandez')?.availableForRemainingEvents).toBe(true);
    expect(byId.get('iker-lecuona')?.availableForRemainingEvents).toBe(false);
    expect(byId.get('joan-mir')?.availableForRemainingEvents).toBe(false);
    expect(byId.get('toprak-razgatlioglu')?.availableForRemainingEvents).toBe(false);
  });

  it('contains the final four rounds, each with a Sprint and a Grand Prix', () => {
    const rounds = [...new Set(season2026.remainingEvents.map((event) => event.round))];
    expect(rounds).toEqual([19, 20, 21, 22]);

    for (const round of rounds) {
      const events = season2026.remainingEvents.filter((event) => event.round === round);
      expect(events.map((event) => event.type)).toEqual(['sprint', 'grandPrix']);
    }

    expect(season2026.remainingEvents[0]).toMatchObject({
      id: '2026-19-malaysia-sprint',
      date: '2026-10-31',
      circuit: 'Sepang International Circuit',
    });
    expect(
      season2026.remainingEvents[season2026.remainingEvents.length - 1],
    ).toMatchObject({
      id: '2026-22-valencia-grand-prix',
      date: '2026-11-29',
    });
  });
});

describe('season data validation', () => {
  it('rejects duplicate rider IDs', () => {
    const data = cloneSeasonData();
    data.riders[1].id = data.riders[0].id;

    expect(issuesFor(data).join('\n')).toContain('duplicates rider id');
  });

  it('rejects a standing that references an unknown rider', () => {
    const data = cloneSeasonData();
    data.startingStandings[0].riderId = 'unknown-rider';

    expect(issuesFor(data).join('\n')).toContain('references unknown rider');
  });

  it('rejects duplicate event IDs', () => {
    const data = cloneSeasonData();
    data.remainingEvents[1].id = data.remainingEvents[0].id;

    expect(issuesFor(data).join('\n')).toContain('duplicates event id');
  });

  it('rejects a points table that is not in descending order', () => {
    const data = cloneSeasonData();
    data.scoring.grandPrix[1] = 30;

    expect(issuesFor(data).join('\n')).toContain('must be in descending order');
  });

  it('rejects a remaining event before the standings cutoff', () => {
    const data = cloneSeasonData();
    data.remainingEvents[0].date = '2026-10-24';

    expect(issuesFor(data).join('\n')).toContain(
      'must be after the standings cutoff',
    );
  });
});

describe('scenario validation', () => {
  it('accepts a partial but valid result', () => {
    const issues = validateScenario(season2026, {
      results: {
        '2026-19-malaysia-grand-prix': ['marc-marquez', 'jorge-martin'],
      },
    });

    expect(issues).toEqual([]);
  });

  it('rejects unknown events, unknown riders, and duplicate riders', () => {
    const issues = validateScenario(season2026, {
      results: {
        '2026-19-malaysia-grand-prix': [
          'marc-marquez',
          'marc-marquez',
          'not-a-rider',
        ],
        'not-an-event': ['jorge-martin'],
      },
    });

    expect(issues).toHaveLength(3);
    expect(issues.join('\n')).toContain('Unknown event ID "not-an-event"');
    expect(issues.join('\n')).toContain('appears more than once');
    expect(issues.join('\n')).toContain('Unknown rider ID "not-a-rider"');
  });
});
