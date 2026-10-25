/**
 * Domain types for the MotoGP championship predictor.
 *
 * These types describe season data and hypothetical scenarios. They are free
 * of DOM and browser APIs so the calculation layer can be tested in isolation.
 */

export type RiderId = string;
export type EventId = string;

export type EventType = 'sprint' | 'grandPrix';

export interface Rider {
  id: RiderId;
  name: string;
  /** Compact label for tight UI, for example "M. Márquez". */
  shortName: string;
  number: number;
  /**
   * Rider colour used for the number badge, as a `#rrggbb` hex string. Taken
   * from the MotoGP live timing feed (`color`).
   */
  color: string;
  /** Text colour that stays legible on `color`, as a `#rrggbb` hex string. */
  textColor: string;
  team: string;
  constructor: string;
  country: string;
  /**
   * Whether the rider is expected to be entered for the remaining rounds at
   * the data cutoff. Riders who are injured, replaced, or only made one-off
   * appearances stay in the standings but are excluded from the race editor.
   */
  availableForRemainingEvents: boolean;
}

export interface Event {
  id: EventId;
  round: number;
  /** Grand Prix name, for example "Petronas Grand Prix of Malaysia". */
  name: string;
  circuit: string;
  country: string;
  /**
   * ISO 8601 calendar date. Sprint events use the Saturday of the weekend;
   * Grand Prix events use the Sunday.
   */
  date: string;
  type: EventType;
}

export interface ScoringRules {
  /** Points for the top 15 classified Grand Prix finishers, winner first. */
  grandPrix: readonly number[];
  /** Points for the top 9 classified Sprint finishers, winner first. */
  sprint: readonly number[];
}

/**
 * Championship countback data. Index 0 counts first places, index 1 counts
 * second places, and so on. Trailing zeroes may be omitted.
 */
export interface Countback {
  grandPrix: readonly number[];
  sprint: readonly number[];
}

export interface Standing {
  /** Official position at the data cutoff (1-based). */
  position: number;
  riderId: RiderId;
  points: number;
  countback: Countback;
}

export interface SeasonMetadata {
  /** ISO date of the last completed session reflected in the standings. */
  standingsCutoff: string;
  /** Championship round completed at the cutoff. */
  standingsCutoffRound: number;
  standingsCutoffLabel: string;
  standingsSource: string;
  calendarSource: string;
  /** Assumptions and caveats that affect how the data should be read. */
  notes: readonly string[];
}

export interface Season {
  year: number;
  meta: SeasonMetadata;
  scoring: ScoringRules;
  riders: readonly Rider[];
  startingStandings: readonly Standing[];
  remainingEvents: readonly Event[];
}

/** A finishing position in a hypothetical result, or null when unfilled. */
export type ResultSlot = RiderId | null;

/**
 * Hypothetical results keyed by event ID. Each value lists positions from
 * winner onwards, where a null entry marks an unfilled position in the middle
 * of a partial classification. An event that is absent has not been simulated.
 * A present list may cover only some positions; only the filled positions
 * score.
 */
export interface Scenario {
  results: Readonly<Record<EventId, readonly ResultSlot[]>>;
}

/** A projected standing after applying a scenario to the starting standings. */
export interface ChampionshipStanding extends Standing {
  /** Official position at the standings cutoff. */
  startingPosition: number;
  /** Points held at the cutoff. */
  startingPoints: number;
  /** Points earned in simulated events only. */
  simulatedPoints: number;
  /** Places gained (positive) or lost (negative) compared with the cutoff. */
  positionChange: number;
}

/** Standings plus the summary information the UI needs. */
export interface ChampionshipProjection {
  standings: readonly ChampionshipStanding[];
  champion: ChampionshipStanding;
  /** Null only when the championship contains a single rider. */
  runnerUp: ChampionshipStanding | null;
  /** Champion points minus runner-up points; zero for a single rider. */
  pointsGap: number;
  /** Simulated event IDs in calendar order. Empty results are ignored. */
  simulatedEvents: readonly EventId[];
}
