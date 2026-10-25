import type { Season } from '../domain/types';
import { parseSeason } from '../domain/validation';
import seasonData from './season-2026.json';

/**
 * Validated 2026 season data.
 *
 * Parsing at module load keeps malformed data from quietly producing
 * misleading championship projections. The unit tests exercise the same
 * parser against the checked-in JSON.
 */
export const season2026: Season = parseSeason(seasonData);
