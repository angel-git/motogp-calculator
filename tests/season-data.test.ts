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
    expect(season2026.riders).toHaveLength(33);
    expect(season2026.startingStandings).toHaveLength(33);
    expect(season2026.remainingEvents).toHaveLength(4);
  });

  it('uses the official Sprint and Grand Prix points tables', () => {
    expect(season2026.scoring.grandPrix).toEqual([
      25, 20, 16, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
    ]);
    expect(season2026.scoring.sprint).toEqual([12, 9, 7, 6, 5, 4, 3, 2, 1]);
  });

  it('records the standings cutoff and sources', () => {
    expect(season2026.meta.standingsCutoff).toBe('2026-11-08');
    expect(season2026.meta.standingsCutoffRound).toBe(20);
    expect(season2026.meta.standingsSource).toContain('resources.motogp.com');
    expect(season2026.meta.calendarSource).toContain('motogp.com');
  });

  it('matches the official standings at the cutoff', () => {
    const standings = new Map(
      season2026.startingStandings.map((standing) => [standing.riderId, standing]),
    );

    expect(standings.get('marc-marquez')).toMatchObject({ position: 1, points: 431 });
    expect(standings.get('jorge-martin')).toMatchObject({ position: 2, points: 371 });
    expect(standings.get('marco-bezzecchi')).toMatchObject({ position: 3, points: 357 });
    expect(standings.get('pedro-acosta')).toMatchObject({ position: 4, points: 309 });
    expect(standings.get('ai-ogura')).toMatchObject({ position: 5, points: 294 });

    // Bastianini stays ahead of Aldeguer after Qatar.
    expect(standings.get('enea-bastianini')).toMatchObject({ position: 10, points: 147 });
    expect(standings.get('fermin-aldeguer')).toMatchObject({ position: 11, points: 129 });

    // Jake Dixon scored two points standing in for Joan Mir at Qatar.
    expect(standings.get('jake-dixon')).toMatchObject({ position: 28, points: 2 });
  });

  it('includes the rider colours used by the number badges', () => {
    const byId = new Map(season2026.riders.map((rider) => [rider.id, rider]));

    expect(byId.get('marc-marquez')).toMatchObject({
      color: '#ad0000',
      textColor: '#ffffff',
    });
    expect(byId.get('fabio-quartararo')).toMatchObject({
      color: '#0a2d82',
      textColor: '#ffffff',
    });

    for (const rider of season2026.riders) {
      expect(rider.color).toMatch(/^#[0-9a-f]{6}$/);
      expect(rider.textColor).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('contains the final two rounds, each with a Sprint and a Grand Prix', () => {
    const rounds = [...new Set(season2026.remainingEvents.map((event) => event.round))];
    expect(rounds).toEqual([21, 22]);

    for (const round of rounds) {
      const events = season2026.remainingEvents.filter((event) => event.round === round);
      expect(events.map((event) => event.type)).toEqual(['sprint', 'grandPrix']);
    }

    expect(season2026.remainingEvents[0]).toMatchObject({
      id: '2026-21-portugal-sprint',
      date: '2026-11-21',
      circuit: 'Algarve International Circuit',
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

  it('rejects a rider colour that is not a hex colour', () => {
    const data = cloneSeasonData();
    data.riders[0].color = 'ad0000';

    expect(issuesFor(data).join('\n')).toContain('must be a hex colour');
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
        '2026-21-portugal-grand-prix': ['marc-marquez', 'jorge-martin'],
      },
    });

    expect(issues).toEqual([]);
  });

  it('rejects unknown events, unknown riders, and duplicate riders', () => {
    const issues = validateScenario(season2026, {
      results: {
        '2026-21-portugal-grand-prix': [
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
