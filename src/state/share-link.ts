import type {
  EventId,
  RiderId,
  ResultSlot,
  Scenario,
  Season,
} from '../domain/types';
import { positionCount } from './scenario';

/**
 * Share links carry the current predictions in the query string so they can be
 * pasted into a chat.
 *
 * Each simulated session gets one `p.<event id>` parameter whose value is the
 * finishing order from the winner down. Rider IDs are separated by commas and
 * `_` marks an unfilled position. Metadata records the format version, season,
 * and standings cutoff the link was made against, so an old link can explain
 * why some or all of its picks no longer apply.
 */

export const SHARE_LINK_VERSION = 1;
export const SHARE_EVENT_PREFIX = 'p.';

const EMPTY_POSITION = '_';
const VERSION_PARAM = 'v';
const SEASON_PARAM = 'y';
const CUTOFF_PARAM = 'c';

export type ShareEventSkipReason =
  | 'unsupported-version'
  | 'different-season'
  | 'event-not-remaining'
  | 'no-valid-picks';

export type ShareRiderSkipReason =
  | 'unknown-rider'
  | 'unavailable-rider'
  | 'duplicate-rider'
  | 'out-of-range';

export interface ShareEventSkip {
  eventId: EventId;
  reason: ShareEventSkipReason;
}

export interface ShareRiderSkip {
  eventId: EventId;
  /** 1-based finishing position from the shared link. */
  position: number;
  riderId: RiderId;
  reason: ShareRiderSkipReason;
}

export interface ShareImport {
  /** Share format version from the link, or null when the link has none. */
  version: number | null;
  /** Season year recorded when the link was created. */
  seasonYear: number | null;
  /** Standings cutoff round recorded when the link was created. */
  cutoffRound: number | null;
  /** Predictions that still apply to the current season data. */
  results: Record<EventId, ResultSlot[]>;
  /** Sessions whose predictions could not be applied at all. */
  skippedEvents: ShareEventSkip[];
  /** Individual picks that were dropped from an otherwise usable result. */
  skippedRiders: ShareRiderSkip[];
  /** Number of session parameters in the link, including skipped sessions. */
  sharedSessionCount: number;
}

export interface ShareSummary {
  tone: 'success' | 'warning';
  message: string;
}

function parseInteger(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function trimTrailingEmpty(result: ResultSlot[]): ResultSlot[] {
  let end = result.length;
  while (end > 0 && result[end - 1] === null) {
    end -= 1;
  }
  return result.slice(0, end);
}

function isShareParam(key: string): boolean {
  return (
    key === VERSION_PARAM ||
    key === SEASON_PARAM ||
    key === CUTOFF_PARAM ||
    key.startsWith(SHARE_EVENT_PREFIX)
  );
}

/**
 * Build a URL from the current scenario.
 *
 * Only sessions still on the remaining calendar are included. Existing share
 * parameters are replaced, while unrelated query parameters are preserved.
 */
export function createShareUrl(
  baseUrl: string,
  season: Season,
  scenario: Scenario,
): string {
  const url = new URL(baseUrl);
  const predictions: string[] = [];

  for (const event of season.remainingEvents) {
    const result = scenario.results[event.id];
    if (!result || result.length === 0) {
      continue;
    }

    const trimmed = trimTrailingEmpty([...result]);
    if (trimmed.length === 0) {
      continue;
    }

    const value = trimmed
      .map((riderId) =>
        riderId === null ? EMPTY_POSITION : encodeURIComponent(riderId),
      )
      .join(',');

    predictions.push(
      `${SHARE_EVENT_PREFIX}${encodeURIComponent(event.id)}=${value}`,
    );
  }

  const retained = new URLSearchParams();
  for (const [key, value] of new URLSearchParams(url.search)) {
    if (!isShareParam(key)) {
      retained.append(key, value);
    }
  }

  const shareParams =
    predictions.length === 0
      ? []
      : [
          `${VERSION_PARAM}=${SHARE_LINK_VERSION}`,
          `${SEASON_PARAM}=${season.year}`,
          `${CUTOFF_PARAM}=${season.meta.standingsCutoffRound}`,
          ...predictions,
        ];

  url.search = [retained.toString(), ...shareParams]
    .filter((part) => part !== '')
    .join('&');
  url.hash = '';
  return url.toString();
}

/**
 * Read shared predictions from a query string.
 *
 * The parser is deliberately tolerant of stale links: sessions that are no
 * longer on the remaining calendar (usually because their results are now
 * official) and picks for riders who are no longer in the field are reported
 * as skipped instead of preventing the rest of the link from loading.
 */
export function parseShareSearch(search: string, season: Season): ShareImport {
  const params = new URLSearchParams(search);
  const eventParams = [...params.entries()].filter(
    ([key]) =>
      key.startsWith(SHARE_EVENT_PREFIX) &&
      key.length > SHARE_EVENT_PREFIX.length,
  );

  const imported: ShareImport = {
    version: parseInteger(params.get(VERSION_PARAM)),
    seasonYear: parseInteger(params.get(SEASON_PARAM)),
    cutoffRound: parseInteger(params.get(CUTOFF_PARAM)),
    results: {},
    skippedEvents: [],
    skippedRiders: [],
    sharedSessionCount: eventParams.length,
  };

  if (eventParams.length === 0) {
    return imported;
  }

  const unsupportedVersion =
    imported.version !== null && imported.version !== SHARE_LINK_VERSION;
  const differentSeason =
    imported.seasonYear !== null && imported.seasonYear !== season.year;

  if (unsupportedVersion || differentSeason) {
    for (const [key] of eventParams) {
      imported.skippedEvents.push({
        eventId: key.slice(SHARE_EVENT_PREFIX.length),
        reason: unsupportedVersion ? 'unsupported-version' : 'different-season',
      });
    }
    return imported;
  }

  const eventById = new Map(season.remainingEvents.map((event) => [event.id, event]));
  const riderById = new Map(season.riders.map((rider) => [rider.id, rider]));

  for (const [key, rawValue] of eventParams) {
    const eventId = key.slice(SHARE_EVENT_PREFIX.length);
    const event = eventById.get(eventId);

    if (!event) {
      imported.skippedEvents.push({
        eventId,
        reason: 'event-not-remaining',
      });
      continue;
    }

    const totalPositions = positionCount(event, season.scoring);
    const seenRiderIds = new Set<RiderId>();
    const result: ResultSlot[] = [];

    rawValue.split(',').forEach((rawToken, index) => {
      const position = index + 1;
      const riderId = rawToken.trim();

      if (riderId === '' || riderId === EMPTY_POSITION) {
        if (index < totalPositions) {
          result.push(null);
        }
        return;
      }

      if (index >= totalPositions) {
        imported.skippedRiders.push({
          eventId,
          position,
          riderId,
          reason: 'out-of-range',
        });
        return;
      }

      const rider = riderById.get(riderId);
      if (!rider) {
        imported.skippedRiders.push({
          eventId,
          position,
          riderId,
          reason: 'unknown-rider',
        });
        result.push(null);
        return;
      }

      if (!rider.availableForRemainingEvents) {
        imported.skippedRiders.push({
          eventId,
          position,
          riderId,
          reason: 'unavailable-rider',
        });
        result.push(null);
        return;
      }

      if (seenRiderIds.has(riderId)) {
        imported.skippedRiders.push({
          eventId,
          position,
          riderId,
          reason: 'duplicate-rider',
        });
        result.push(null);
        return;
      }

      seenRiderIds.add(riderId);
      result.push(riderId);
    });

    const trimmed = trimTrailingEmpty(result);
    if (trimmed.length === 0) {
      imported.skippedEvents.push({
        eventId,
        reason: 'no-valid-picks',
      });
    } else {
      imported.results[eventId] = trimmed;
    }
  }

  return imported;
}

function countLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

/**
 * Explain what happened when a shared link was opened.
 *
 * Returns null when the URL is not a share link. The distinction between a
 * completed session and an unusable pick matters: completed sessions use their
 * official results, while individual picks are simply absent from the
 * projection.
 */
export function summarizeShareImport(
  imported: ShareImport,
  season: Season,
): ShareSummary | null {
  if (imported.sharedSessionCount === 0) {
    return null;
  }

  const appliedSessions = Object.keys(imported.results).length;
  const appliedPicks = Object.values(imported.results).reduce(
    (total, result) =>
      total + result.filter((riderId) => riderId !== null).length,
    0,
  );
  const completedSessions = imported.skippedEvents.filter(
    (event) => event.reason === 'event-not-remaining',
  ).length;
  const emptySessions = imported.skippedEvents.filter(
    (event) => event.reason === 'no-valid-picks',
  ).length;
  const droppedPicks = imported.skippedRiders.length;
  const cutoffChanged =
    imported.cutoffRound !== null &&
    imported.cutoffRound !== season.meta.standingsCutoffRound;

  if (imported.version !== null && imported.version !== SHARE_LINK_VERSION) {
    return {
      tone: 'warning',
      message:
        'This link uses a newer share format than this version of the app can read.',
    };
  }

  if (imported.seasonYear !== null && imported.seasonYear !== season.year) {
    return {
      tone: 'warning',
      message: `This link was created for the ${imported.seasonYear} season, so its predictions do not apply to ${season.year}.`,
    };
  }

  if (appliedSessions === 0) {
    if (completedSessions > 0) {
      return {
        tone: 'warning',
        message:
          'The shared link only contains predictions for sessions that have since been completed, so the current official results are shown instead.',
      };
    }

    return {
      tone: 'warning',
      message: 'No predictions from the shared link apply to the remaining sessions.',
    };
  }

  const parts = [
    `Loaded ${countLabel(appliedPicks, 'prediction')} for ${countLabel(
      appliedSessions,
      'session',
    )}.`,
  ];

  if (completedSessions > 0) {
    parts.push(
      `${countLabel(completedSessions, 'session')} from the link ${
        completedSessions === 1 ? 'was' : 'were'
      } already completed, so the official results are used instead.`,
    );
  }

  if (emptySessions > 0) {
    parts.push(
      `${countLabel(emptySessions, 'session')} had no applicable picks and ${
        emptySessions === 1 ? 'was' : 'were'
      } skipped.`,
    );
  }

  if (droppedPicks > 0) {
    parts.push(
      `${countLabel(droppedPicks, 'pick')} could not be applied because the rider or position is not valid for the remaining sessions.`,
    );
  }

  if (cutoffChanged) {
    parts.push(
      `The link was based on the standings after Round ${imported.cutoffRound}; this page uses the official standings after Round ${season.meta.standingsCutoffRound}.`,
    );
  }

  const warning =
    completedSessions > 0 ||
    emptySessions > 0 ||
    droppedPicks > 0 ||
    cutoffChanged;

  return {
    tone: warning ? 'warning' : 'success',
    message: parts.join(' '),
  };
}
