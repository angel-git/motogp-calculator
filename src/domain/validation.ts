import type {
  Countback,
  Event,
  EventType,
  Rider,
  RiderId,
  Scenario,
  Season,
  SeasonMetadata,
  ScoringRules,
  Standing,
} from './types';

/** Thrown when season data does not match the expected shape or invariants. */
export class SeasonDataError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid season data:\n- ${issues.join('\n- ')}`);
    this.name = 'SeasonDataError';
    this.issues = issues;
  }
}

/** Thrown when a scenario references invalid events, riders, or duplicates. */
export class ScenarioError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid scenario:\n- ${issues.join('\n- ')}`);
    this.name = 'ScenarioError';
    this.issues = issues;
  }
}

const RIDER_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EVENT_ID_PATTERN = /^\d{4}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Deepest finishing position present in the cutoff classification: Grands
 * Prix are classified through 21st, Sprints only through the scoring positions.
 */
const MAX_GRAND_PRIX_COUNTBACK_LENGTH = 21;
const MAX_SPRINT_COUNTBACK_LENGTH = 9;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function readString(
  record: UnknownRecord,
  key: string,
  path: string,
  issues: string[],
): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim() === '') {
    issues.push(`${path}.${key} must be a non-empty string`);
    return '';
  }
  return value;
}

function readBoolean(
  record: UnknownRecord,
  key: string,
  path: string,
  issues: string[],
): boolean {
  const value = record[key];
  if (typeof value !== 'boolean') {
    issues.push(`${path}.${key} must be a boolean`);
    return false;
  }
  return value;
}

function readInteger(
  record: UnknownRecord,
  key: string,
  path: string,
  issues: string[],
  min?: number,
  max?: number,
): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    issues.push(`${path}.${key} must be an integer`);
    return Number.NaN;
  }

  if (min !== undefined && value < min) {
    issues.push(`${path}.${key} must be at least ${min}`);
  }
  if (max !== undefined && value > max) {
    issues.push(`${path}.${key} must be at most ${max}`);
  }

  return value;
}

function readStringArray(value: unknown, path: string, issues: string[]): string[] {
  if (!Array.isArray(value)) {
    issues.push(`${path} must be an array of strings`);
    return [];
  }

  return value.map((entry, index) => {
    if (typeof entry !== 'string' || entry.trim() === '') {
      issues.push(`${path}[${index}] must be a non-empty string`);
      return '';
    }
    return entry;
  });
}

function readEventType(
  record: UnknownRecord,
  key: string,
  path: string,
  issues: string[],
): EventType {
  const value = record[key];
  if (value === 'sprint' || value === 'grandPrix') {
    return value;
  }

  issues.push(`${path}.${key} must be "sprint" or "grandPrix"`);
  return 'sprint';
}

function parsePoints(value: unknown, path: string, issues: string[]): number[] {
  if (!Array.isArray(value)) {
    issues.push(`${path} must be an array`);
    return [];
  }

  if (value.length === 0) {
    issues.push(`${path} must not be empty`);
  }

  const points = value.map((entry, index) => {
    if (typeof entry !== 'number' || !Number.isInteger(entry) || entry < 0) {
      issues.push(`${path}[${index}] must be a non-negative integer`);
      return 0;
    }
    return entry;
  });

  for (let index = 1; index < points.length; index += 1) {
    if (points[index] > points[index - 1]) {
      issues.push(`${path} must be in descending order (index ${index})`);
    }
  }

  return points;
}

function parseScoring(value: unknown, issues: string[]): ScoringRules {
  if (!isRecord(value)) {
    issues.push('scoring must be an object');
    return { grandPrix: [], sprint: [] };
  }

  return {
    grandPrix: parsePoints(value.grandPrix, 'scoring.grandPrix', issues),
    sprint: parsePoints(value.sprint, 'scoring.sprint', issues),
  };
}

function parseMeta(value: unknown, issues: string[]): SeasonMetadata {
  if (!isRecord(value)) {
    issues.push('meta must be an object');
    return {
      standingsCutoff: '',
      standingsCutoffRound: 0,
      standingsCutoffLabel: '',
      standingsSource: '',
      calendarSource: '',
      notes: [],
    };
  }

  const standingsCutoff = readString(value, 'standingsCutoff', 'meta', issues);
  if (standingsCutoff !== '' && !isIsoDate(standingsCutoff)) {
    issues.push('meta.standingsCutoff must be a valid ISO date (YYYY-MM-DD)');
  }

  return {
    standingsCutoff,
    standingsCutoffRound: readInteger(value, 'standingsCutoffRound', 'meta', issues, 1),
    standingsCutoffLabel: readString(value, 'standingsCutoffLabel', 'meta', issues),
    standingsSource: readString(value, 'standingsSource', 'meta', issues),
    calendarSource: readString(value, 'calendarSource', 'meta', issues),
    notes: readStringArray(value.notes, 'meta.notes', issues),
  };
}

function parseRiders(value: unknown, issues: string[]): Rider[] {
  if (!Array.isArray(value)) {
    issues.push('riders must be an array');
    return [];
  }

  const seenIds = new Set<string>();

  return value.map((entry, index) => {
    const path = `riders[${index}]`;
    if (!isRecord(entry)) {
      issues.push(`${path} must be an object`);
      return {
        id: '',
        name: '',
        shortName: '',
        number: 0,
        team: '',
        constructor: '',
        country: '',
        availableForRemainingEvents: false,
      };
    }

    const id = readString(entry, 'id', path, issues);
    if (id !== '' && !RIDER_ID_PATTERN.test(id)) {
      issues.push(`${path}.id must be a kebab-case identifier`);
    }
    if (id !== '' && seenIds.has(id)) {
      issues.push(`${path}.id duplicates rider id "${id}"`);
    }
    if (id !== '') {
      seenIds.add(id);
    }

    return {
      id,
      name: readString(entry, 'name', path, issues),
      shortName: readString(entry, 'shortName', path, issues),
      number: readInteger(entry, 'number', path, issues, 1, 999),
      team: readString(entry, 'team', path, issues),
      constructor: readString(entry, 'constructor', path, issues),
      country: readString(entry, 'country', path, issues),
      availableForRemainingEvents: readBoolean(
        entry,
        'availableForRemainingEvents',
        path,
        issues,
      ),
    };
  });
}

function parseCountArray(
  value: unknown,
  path: string,
  maxLength: number,
  issues: string[],
): number[] {
  if (!Array.isArray(value)) {
    issues.push(`${path} must be an array`);
    return [];
  }

  if (value.length > maxLength) {
    issues.push(`${path} must contain at most ${maxLength} entries`);
  }

  return value.map((entry, index) => {
    if (typeof entry !== 'number' || !Number.isInteger(entry) || entry < 0) {
      issues.push(`${path}[${index}] must be a non-negative integer`);
      return 0;
    }
    return entry;
  });
}

function parseCountback(value: unknown, path: string, issues: string[]): Countback {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object`);
    return { grandPrix: [], sprint: [] };
  }

  return {
    grandPrix: parseCountArray(
      value.grandPrix,
      `${path}.grandPrix`,
      MAX_GRAND_PRIX_COUNTBACK_LENGTH,
      issues,
    ),
    sprint: parseCountArray(
      value.sprint,
      `${path}.sprint`,
      MAX_SPRINT_COUNTBACK_LENGTH,
      issues,
    ),
  };
}

function parseStandings(
  value: unknown,
  riders: readonly Rider[],
  issues: string[],
): Standing[] {
  if (!Array.isArray(value)) {
    issues.push('startingStandings must be an array');
    return [];
  }

  const knownRiderIds = new Set(riders.map((rider) => rider.id));
  const seenRiderIds = new Set<string>();

  const standings = value.map((entry, index) => {
    const path = `startingStandings[${index}]`;
    if (!isRecord(entry)) {
      issues.push(`${path} must be an object`);
      return {
        position: index + 1,
        riderId: '',
        points: 0,
        countback: { grandPrix: [], sprint: [] },
      };
    }

    const position = readInteger(entry, 'position', path, issues, 1);
    if (position !== index + 1) {
      issues.push(`${path}.position must be ${index + 1}; standings must be in official order`);
    }

    const riderId = readString(entry, 'riderId', path, issues);
    if (riderId !== '' && !knownRiderIds.has(riderId)) {
      issues.push(`${path}.riderId references unknown rider "${riderId}"`);
    }
    if (riderId !== '' && seenRiderIds.has(riderId)) {
      issues.push(`${path}.riderId duplicates rider "${riderId}"`);
    }
    if (riderId !== '') {
      seenRiderIds.add(riderId);
    }

    return {
      position,
      riderId,
      points: readInteger(entry, 'points', path, issues, 0),
      countback: parseCountback(entry.countback, `${path}.countback`, issues),
    };
  });

  if (value.length !== riders.length) {
    issues.push(
      `startingStandings must contain one entry per rider (${riders.length}); found ${value.length}`,
    );
  }

  for (const rider of riders) {
    if (!seenRiderIds.has(rider.id)) {
      issues.push(`startingStandings is missing rider "${rider.id}"`);
    }
  }

  return standings;
}

function parseEvents(
  value: unknown,
  meta: SeasonMetadata,
  issues: string[],
): Event[] {
  if (!Array.isArray(value)) {
    issues.push('remainingEvents must be an array');
    return [];
  }

  const seenIds = new Set<string>();
  const seenRoundTypes = new Set<string>();
  let previousRound = 0;
  let previousType: EventType | null = null;

  return value.map((entry, index) => {
    const path = `remainingEvents[${index}]`;
    if (!isRecord(entry)) {
      issues.push(`${path} must be an object`);
      return {
        id: '',
        round: 0,
        name: '',
        circuit: '',
        country: '',
        date: '',
        type: 'sprint' as const,
      };
    }

    const id = readString(entry, 'id', path, issues);
    if (id !== '' && !EVENT_ID_PATTERN.test(id)) {
      issues.push(`${path}.id must start with the season year and round, for example "2026-19-malaysia-sprint"`);
    }
    if (id !== '' && seenIds.has(id)) {
      issues.push(`${path}.id duplicates event id "${id}"`);
    }
    if (id !== '') {
      seenIds.add(id);
    }

    const round = readInteger(entry, 'round', path, issues, 1);
    if (Number.isInteger(round) && round <= meta.standingsCutoffRound) {
      issues.push(
        `${path}.round must be after the standings cutoff round (${meta.standingsCutoffRound})`,
      );
    }

    const type = readEventType(entry, 'type', path, issues);
    const roundTypeKey = `${round}:${type}`;
    if (seenRoundTypes.has(roundTypeKey)) {
      issues.push(`${path} duplicates round ${round} ${type}`);
    }
    seenRoundTypes.add(roundTypeKey);

    if (round < previousRound) {
      issues.push('remainingEvents must be ordered by round in ascending order');
    }
    if (round === previousRound && previousType === 'grandPrix' && type === 'sprint') {
      issues.push('within a round, the sprint event must come before the grand prix event');
    }
    if (round > previousRound) {
      previousRound = round;
    }
    previousType = type;

    const date = readString(entry, 'date', path, issues);
    if (date !== '') {
      if (!isIsoDate(date)) {
        issues.push(`${path}.date must be a valid ISO date (YYYY-MM-DD)`);
      } else if (meta.standingsCutoff !== '' && date <= meta.standingsCutoff) {
        issues.push(
          `${path}.date must be after the standings cutoff (${meta.standingsCutoff})`,
        );
      }
    }

    return {
      id,
      round,
      name: readString(entry, 'name', path, issues),
      circuit: readString(entry, 'circuit', path, issues),
      country: readString(entry, 'country', path, issues),
      date,
      type,
    };
  });
}

/**
 * Validate untrusted season data and return it in the domain shape.
 *
 * @throws {SeasonDataError} when any validation issue is found.
 */
export function parseSeason(value: unknown): Season {
  const issues: string[] = [];

  if (!isRecord(value)) {
    throw new SeasonDataError(['season data must be an object']);
  }

  const season: Season = {
    year: readInteger(value, 'year', 'season', issues, 2000, 2100),
    meta: parseMeta(value.meta, issues),
    scoring: parseScoring(value.scoring, issues),
    riders: parseRiders(value.riders, issues),
    startingStandings: [],
    remainingEvents: [],
  };

  season.startingStandings = parseStandings(
    value.startingStandings,
    season.riders,
    issues,
  );
  season.remainingEvents = parseEvents(value.remainingEvents, season.meta, issues);

  if (issues.length > 0) {
    throw new SeasonDataError(issues);
  }

  return season;
}

/**
 * Check a scenario against the events and riders it is allowed to reference.
 *
 * Partial results are allowed: only the positions present in the array are
 * treated as filled. An event absent from the scenario has not been simulated.
 */
export function validateScenarioResults(
  events: readonly Event[],
  riderIds: readonly RiderId[],
  scenario: Scenario,
): string[] {
  const issues: string[] = [];
  const eventIds = new Set(events.map((event) => event.id));
  const knownRiderIds = new Set(riderIds);

  for (const [eventId, finishingOrder] of Object.entries(scenario.results)) {
    if (!eventIds.has(eventId)) {
      issues.push(`Unknown event ID "${eventId}"`);
      continue;
    }

    if (!Array.isArray(finishingOrder)) {
      issues.push(`Result for event "${eventId}" must be an array of rider IDs`);
      continue;
    }

    const seenRiderIds = new Set<string>();
    finishingOrder.forEach((riderId, index) => {
      if (!knownRiderIds.has(riderId)) {
        issues.push(
          `Unknown rider ID "${riderId}" at position ${index + 1} in event "${eventId}"`,
        );
      }
      if (seenRiderIds.has(riderId)) {
        issues.push(`Rider "${riderId}" appears more than once in event "${eventId}"`);
      }
      seenRiderIds.add(riderId);
    });
  }

  return issues;
}

/**
 * Check a scenario for unknown IDs and repeated riders. Partial results are
 * allowed: only the positions present in the array are treated as filled.
 */
export function validateScenario(season: Season, scenario: Scenario): string[] {
  return validateScenarioResults(
    season.remainingEvents,
    season.riders.map((rider) => rider.id),
    scenario,
  );
}
