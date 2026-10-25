import { describe, expect, it } from 'vitest';
import { season2026 } from '../src/data/season';
import type { Scenario, Season } from '../src/domain/types';
import {
  SHARE_LINK_VERSION,
  createShareUrl,
  parseShareSearch,
  summarizeShareImport,
} from '../src/state/share-link';

const SPRINT = season2026.remainingEvents.find((event) => event.type === 'sprint')!;
const GRAND_PRIX = season2026.remainingEvents.find(
  (event) => event.type === 'grandPrix',
)!;
const ROUND_19 = season2026.remainingEvents.filter((event) => event.round === 19);
const ROUND_20 = season2026.remainingEvents.filter((event) => event.round === 20);

function nextWeekSeason(): Season {
  return {
    ...season2026,
    meta: {
      ...season2026.meta,
      standingsCutoff: '2026-10-31',
      standingsCutoffRound: 19,
    },
    remainingEvents: season2026.remainingEvents.filter(
      (event) => event.round > 19,
    ),
  };
}

describe('share URL encoding', () => {
  it('round-trips partial results, gaps, and metadata', () => {
    const scenario: Scenario = {
      results: {
        [SPRINT.id]: ['marc-marquez', null, 'jorge-martin'],
        [GRAND_PRIX.id]: ['jorge-martin', 'marc-marquez'],
      },
    };

    const url = new URL(
      createShareUrl(
        'https://example.com/motogp-calculator/?utm_source=test#standings',
        season2026,
        scenario,
      ),
    );

    expect(url.origin + url.pathname).toBe(
      'https://example.com/motogp-calculator/',
    );
    expect(url.hash).toBe('');
    expect(url.searchParams.get('utm_source')).toBe('test');
    expect(url.searchParams.get('v')).toBe(String(SHARE_LINK_VERSION));
    expect(url.searchParams.get('y')).toBe('2026');
    expect(url.searchParams.get('c')).toBe(
      String(season2026.meta.standingsCutoffRound),
    );
    expect(url.searchParams.get(`p.${SPRINT.id}`)).toBe(
      'marc-marquez,_,jorge-martin',
    );

    const imported = parseShareSearch(url.search, season2026);
    expect(imported.results).toEqual(scenario.results);
    expect(imported.skippedEvents).toEqual([]);
    expect(imported.skippedRiders).toEqual([]);
    expect(imported.sharedSessionCount).toBe(2);
  });

  it('produces a clean URL when nothing has been simulated', () => {
    const url = new URL(
      createShareUrl('https://example.com/app/?p.old-event=x', season2026, {
        results: {},
      }),
    );

    expect(url.search).toBe('');
    expect(url.toString()).toBe('https://example.com/app/');
  });

  it('ignores events that are no longer on the remaining calendar', () => {
    const scenario: Scenario = {
      results: {
        [ROUND_19[0].id]: ['marc-marquez'],
        [ROUND_20[0].id]: ['jorge-martin'],
      },
    };
    const shared = new URL(
      createShareUrl('https://example.com/', season2026, scenario),
    );
    const nextSeason = nextWeekSeason();

    const imported = parseShareSearch(shared.search, nextSeason);

    expect(imported.results).toEqual({
      [ROUND_20[0].id]: ['jorge-martin'],
    });
    expect(imported.skippedEvents).toEqual([
      { eventId: ROUND_19[0].id, reason: 'event-not-remaining' },
    ]);

    const summary = summarizeShareImport(imported, nextSeason)!;
    expect(summary.tone).toBe('warning');
    expect(summary.message).toContain('already completed');
    expect(summary.message).toContain('official results');
    expect(summary.message).toContain('after Round 18');
    expect(summary.message).toContain('after Round 19');
  });

  it('explains when every shared session has since been completed', () => {
    const scenario: Scenario = {
      results: {
        [ROUND_19[0].id]: ['marc-marquez'],
        [ROUND_19[1].id]: ['jorge-martin'],
      },
    };
    const shared = new URL(
      createShareUrl('https://example.com/', season2026, scenario),
    );

    const imported = parseShareSearch(shared.search, nextWeekSeason());
    const summary = summarizeShareImport(imported, nextWeekSeason())!;

    expect(imported.results).toEqual({});
    expect(imported.skippedEvents).toHaveLength(2);
    expect(summary.tone).toBe('warning');
    expect(summary.message).toContain('only contains predictions');
    expect(summary.message).toContain('current official results');
  });

  it('drops unknown and unavailable riders without losing later picks', () => {
    const search = new URLSearchParams({
      v: String(SHARE_LINK_VERSION),
      y: String(season2026.year),
      c: String(season2026.meta.standingsCutoffRound),
      [`p.${SPRINT.id}`]: 'joan-mir,not-a-rider,marc-marquez',
    }).toString();

    const imported = parseShareSearch(search, season2026);

    expect(imported.results).toEqual({
      [SPRINT.id]: [null, null, 'marc-marquez'],
    });
    expect(imported.skippedRiders).toEqual([
      {
        eventId: SPRINT.id,
        position: 1,
        riderId: 'joan-mir',
        reason: 'unavailable-rider',
      },
      {
        eventId: SPRINT.id,
        position: 2,
        riderId: 'not-a-rider',
        reason: 'unknown-rider',
      },
    ]);

    const summary = summarizeShareImport(imported, season2026)!;
    expect(summary.tone).toBe('warning');
    expect(summary.message).toContain('2 picks could not be applied');
  });

  it('keeps the first of a duplicated rider and reports the duplicate', () => {
    const search = new URLSearchParams({
      [`p.${SPRINT.id}`]: 'marc-marquez,marc-marquez',
    }).toString();

    const imported = parseShareSearch(search, season2026);

    expect(imported.results).toEqual({
      [SPRINT.id]: ['marc-marquez'],
    });
    expect(imported.skippedRiders).toEqual([
      {
        eventId: SPRINT.id,
        position: 2,
        riderId: 'marc-marquez',
        reason: 'duplicate-rider',
      },
    ]);
  });

  it('ignores picks beyond the scoring positions', () => {
    const riders = season2026.riders
      .filter((rider) => rider.availableForRemainingEvents)
      .slice(0, 16)
      .map((rider) => rider.id);
    const search = new URLSearchParams({
      [`p.${GRAND_PRIX.id}`]: riders.join(','),
    }).toString();

    const imported = parseShareSearch(search, season2026);

    expect(imported.results[GRAND_PRIX.id]).toHaveLength(15);
    expect(imported.skippedRiders).toEqual([
      {
        eventId: GRAND_PRIX.id,
        position: 16,
        riderId: riders[15],
        reason: 'out-of-range',
      },
    ]);
  });

  it('rejects links from a different season', () => {
    const search = new URLSearchParams({
      v: String(SHARE_LINK_VERSION),
      y: '2025',
      [`p.${SPRINT.id}`]: 'marc-marquez',
    }).toString();
    const futureSeason: Season = { ...season2026, year: 2027 };

    const imported = parseShareSearch(search, futureSeason);
    const summary = summarizeShareImport(imported, futureSeason)!;

    expect(imported.results).toEqual({});
    expect(imported.skippedEvents).toEqual([
      { eventId: SPRINT.id, reason: 'different-season' },
    ]);
    expect(summary.message).toContain('2025 season');
    expect(summary.message).toContain('2027');
  });

  it('rejects a newer share format', () => {
    const search = new URLSearchParams({
      v: '99',
      [`p.${SPRINT.id}`]: 'marc-marquez',
    }).toString();

    const imported = parseShareSearch(search, season2026);
    const summary = summarizeShareImport(imported, season2026)!;

    expect(imported.results).toEqual({});
    expect(imported.skippedEvents).toEqual([
      { eventId: SPRINT.id, reason: 'unsupported-version' },
    ]);
    expect(summary.message).toContain('newer share format');
  });

  it('replaces older share params while keeping unrelated ones', () => {
    const first = createShareUrl(
      'https://example.com/app/?ref=chat',
      season2026,
      { results: { [SPRINT.id]: ['marc-marquez'] } },
    );
    const second = createShareUrl(first, season2026, {
      results: { [GRAND_PRIX.id]: ['jorge-martin'] },
    });
    const url = new URL(second);

    expect(url.searchParams.get('ref')).toBe('chat');
    expect(url.searchParams.get(`p.${SPRINT.id}`)).toBeNull();
    expect(url.searchParams.get(`p.${GRAND_PRIX.id}`)).toBe('jorge-martin');
  });
});
