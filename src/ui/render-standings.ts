import { calculateChampionship } from '../domain/championship';
import type { Rider, RiderId, Season } from '../domain/types';
import {
  getEventStatus,
  type ScenarioStore,
} from '../state/scenario';
import { el } from './dom';

export interface StandingsPanelOptions {
  season: Season;
  store: ScenarioStore;
}

/**
 * Live projected standings derived from the editor state.
 *
 * The standings are never stored: every render recalculates them from the
 * season's starting standings plus the current scenario.
 */
export function createStandingsPanel({
  season,
  store,
}: StandingsPanelOptions): HTMLElement {
  const riderById = new Map<RiderId, Rider>(
    season.riders.map((rider) => [rider.id, rider]),
  );
  const totalEvents = season.remainingEvents.length;

  const panel = el('section', 'panel standings-panel');
  panel.setAttribute('aria-labelledby', 'standings-heading');

  const header = el('div', 'panel__header');
  const heading = el('h2', 'panel__title', 'Projected standings');
  heading.id = 'standings-heading';
  const note = el('p', 'panel__note');
  header.append(heading, note);

  const tableWrap = el('div', 'standings-table__wrap');
  const table = el('table', 'standings-table');
  const caption = el('caption', 'visually-hidden', 'Projected championship standings');
  const thead = el('thead');
  const headRow = el('tr');
  for (const [label, className] of [
    ['Pos', 'standings-table__position'],
    ['Rider', 'standings-table__rider'],
    ['Current', 'standings-table__points'],
    ['Simulated', 'standings-table__points'],
    ['Total', 'standings-table__points'],
  ] as const) {
    const th = el('th', className, label);
    th.scope = 'col';
    headRow.append(th);
  }
  thead.append(headRow);

  const tbody = el('tbody');
  table.append(caption, thead, tbody);
  tableWrap.append(table);

  const incompleteNote = el('p', 'standings-panel__warning');
  incompleteNote.hidden = true;
  const liveRegion = el('p', 'visually-hidden');
  liveRegion.setAttribute('role', 'status');
  liveRegion.setAttribute('aria-live', 'polite');

  panel.append(header, tableWrap, incompleteNote, liveRegion);

  function render(): void {
    const scenario = store.getScenario();
    const projection = calculateChampionship(
      season.startingStandings,
      season.remainingEvents,
      scenario,
      season.scoring,
    );

    const incompleteEvents = season.remainingEvents.filter((event) => {
      const result = scenario.results[event.id] ?? [];
      return getEventStatus(event, result, season.scoring).kind === 'incomplete';
    });

    const simulatedCount = projection.simulatedEvents.length;

    note.textContent =
      simulatedCount === 0
        ? 'No sessions simulated yet, so this is the current championship order.'
        : `${simulatedCount} of ${totalEvents} sessions simulated.`;

    if (incompleteEvents.length > 0) {
      incompleteNote.textContent = `${incompleteEvents.length} incomplete session${
        incompleteEvents.length === 1 ? '' : 's'
      }: only filled positions score points.`;
      incompleteNote.hidden = false;
    } else {
      incompleteNote.hidden = true;
    }

    const fragment = document.createDocumentFragment();

    for (const standing of projection.standings) {
      const rider = riderById.get(standing.riderId);
      const row = el('tr', 'standings-table__row');
      if (standing.position === 1) {
        row.classList.add('standings-table__row--leader');
      }

      const position = el(
        'td',
        'standings-table__position',
        String(standing.position),
      );

      const riderCell = el('td', 'standings-table__rider');
      const riderName = el('span', 'standings-table__rider-name');
      const number = el(
        'span',
        'standings-table__number',
        rider ? `#${rider.number}` : '',
      );
      const name = el('span', '', rider?.shortName ?? standing.riderId);
      riderName.append(number, name);
      const team = el('span', 'standings-table__team', rider?.team ?? '');
      riderCell.append(riderName, team);

      const current = el(
        'td',
        'standings-table__points',
        String(standing.startingPoints),
      );
      const simulated = el(
        'td',
        'standings-table__points standings-table__points--simulated',
        standing.simulatedPoints > 0 ? `+${standing.simulatedPoints}` : '—',
      );
      if (standing.simulatedPoints > 0) {
        simulated.classList.add('standings-table__points--positive');
      }
      const total = el('td', 'standings-table__points standings-table__points--total');
      total.append(el('strong', '', String(standing.points)));

      row.append(position, riderCell, current, simulated, total);
      fragment.append(row);
    }

    tbody.replaceChildren(fragment);
    liveRegion.textContent = `Projected standings updated. ${simulatedCount} of ${totalEvents} sessions simulated.`;
  }

  store.subscribe(render);
  render();

  return panel;
}
