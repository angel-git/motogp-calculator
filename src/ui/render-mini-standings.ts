import { calculateChampionship } from '../domain/championship';
import type { Rider, RiderId, Season } from '../domain/types';
import type { ScenarioStore } from '../state/scenario';
import { el } from './dom';
import { createRiderNumber } from './rider-number';

export interface MiniStandingsOptions {
  season: Season;
  store: ScenarioStore;
}

/**
 * Compact top-three summary shown on narrow screens, where the full standings
 * table sits below the race editor. It sticks to the top of the viewport so the
 * effect of each selection stays visible while filling a session.
 */
export function createMiniStandings({
  season,
  store,
}: MiniStandingsOptions): HTMLElement {
  const riderById = new Map<RiderId, Rider>(
    season.riders.map((rider) => [rider.id, rider]),
  );

  const summary = el('aside', 'mini-standings');
  summary.setAttribute('aria-label', 'Top three projected standings');
  const list = el('ol', 'mini-standings__list');
  summary.append(list);

  function render(): void {
    const projection = calculateChampionship(
      season.startingStandings,
      season.remainingEvents,
      store.getScenario(),
      season.scoring,
    );

    const fragment = document.createDocumentFragment();

    for (const standing of projection.standings.slice(0, 3)) {
      const rider = riderById.get(standing.riderId);
      const item = el('li', 'mini-standings__item');
      if (standing.position === 1) {
        item.classList.add('mini-standings__item--leader');
      }

      const position = el(
        'span',
        'mini-standings__position',
        String(standing.position),
      );
      const name = el(
        'span',
        'mini-standings__name',
        rider?.shortName ?? standing.riderId,
      );
      const score = el('span', 'mini-standings__score');
      score.append(el('strong', '', String(standing.points)));
      if (standing.simulatedPoints > 0) {
        score.append(
          el(
            'span',
            'mini-standings__delta',
            `+${standing.simulatedPoints}`,
          ),
        );
      }

      item.append(position, createRiderNumber(rider), name, score);
      fragment.append(item);
    }

    list.replaceChildren(fragment);
  }

  store.subscribe(render);
  render();

  return summary;
}
