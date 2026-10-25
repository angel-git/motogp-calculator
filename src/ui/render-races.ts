import { pointsForPosition } from '../domain/scoring';
import type { Event, Rider, Season } from '../domain/types';
import {
  getEventStatus,
  positionCount,
  sortRidersByStanding,
  type ScenarioStore,
} from '../state/scenario';
import { el, formatDateRange, formatEventDate } from './dom';

export interface RaceEditorOptions {
  season: Season;
  store: ScenarioStore;
}

interface SessionView {
  sync: () => void;
}

interface RoundGroup {
  round: number;
  name: string;
  circuit: string;
  country: string;
  startDate: string;
  endDate: string;
  events: Event[];
}

function groupEventsByRound(events: readonly Event[]): RoundGroup[] {
  const groups = new Map<number, RoundGroup>();

  for (const event of events) {
    const existing = groups.get(event.round);
    if (existing) {
      existing.events.push(event);
      if (event.date < existing.startDate) {
        existing.startDate = event.date;
      }
      if (event.date > existing.endDate) {
        existing.endDate = event.date;
      }
      continue;
    }

    groups.set(event.round, {
      round: event.round,
      name: event.name,
      circuit: event.circuit,
      country: event.country,
      startDate: event.date,
      endDate: event.date,
      events: [event],
    });
  }

  return [...groups.values()].sort((a, b) => a.round - b.round);
}

function eventTypeLabel(event: Event): string {
  return event.type === 'sprint' ? 'Sprint' : 'Grand Prix';
}

function createSession(
  event: Event,
  season: Season,
  store: ScenarioStore,
  riders: readonly Rider[],
): { element: HTMLElement; view: SessionView } {
  const section = el('section', 'session');
  section.dataset.eventId = event.id;

  const header = el('div', 'session__header');
  const titleGroup = el('div', 'session__titles');
  const title = el('h4', 'session__title', eventTypeLabel(event));
  const date = el('span', 'session__date', formatEventDate(event.date));
  titleGroup.append(title, date);

  const status = el('span', 'status');
  status.title = '';

  const clearButton = el('button', 'button button--ghost', 'Clear');
  clearButton.type = 'button';
  clearButton.setAttribute(
    'aria-label',
    `Clear ${event.name} ${eventTypeLabel(event)} result`,
  );
  clearButton.addEventListener('click', () => {
    store.clearEvent(event.id);
  });

  header.append(titleGroup, status, clearButton);

  const list = el('ol', 'position-list');
  const rows: HTMLLIElement[] = [];
  const selects: HTMLSelectElement[] = [];
  const totalPositions = positionCount(event, season.scoring);

  for (let index = 0; index < totalPositions; index += 1) {
    const position = index + 1;
    const row = el('li', 'position-row');
    const number = el('span', 'position-row__number', String(position));
    const label = el('label', 'position-row__field');
    const labelText = el(
      'span',
      'visually-hidden',
      `${event.name} ${eventTypeLabel(event)} position ${position}`,
    );

    const select = document.createElement('select');
    select.className = 'position-row__select';
    select.id = `${event.id}-position-${position}`;

    const emptyOption = new Option('Select rider', '');
    emptyOption.title = 'No rider selected';
    select.add(emptyOption);

    for (const rider of riders) {
      select.add(new Option(`#${rider.number} ${rider.shortName}`, rider.id));
    }

    select.addEventListener('change', () => {
      try {
        store.setPosition(event.id, position, select.value);
      } catch (error) {
        // The store rejects duplicate riders. The UI disables those choices,
        // so reaching this path means the view and state disagree; resync
        // rather than leaving a misleading selection.
        console.error(error);
        sync();
      }
    });

    const points = pointsForPosition(event.type, position, season.scoring);
    const pointsLabel = el('span', 'position-row__points', `${points} pts`);

    label.append(labelText, select);
    row.append(number, label, pointsLabel);
    list.append(row);

    rows.push(row);
    selects.push(select);
  }

  section.append(header, list);

  function sync(): void {
    const result = store.getEventResults(event.id);
    const selectedRiders = new Set(result);
    const eventStatus = getEventStatus(event, result, season.scoring);

    status.textContent = eventStatus.label;
    status.className = `status status--${eventStatus.kind}`;
    status.title = eventStatus.description;
    clearButton.disabled = result.length === 0;

    for (let index = 0; index < selects.length; index += 1) {
      const select = selects[index];
      const row = rows[index];
      const value = result[index] ?? '';

      if (select.value !== value) {
        select.value = value;
      }

      const placeholder = select.options[0];
      if (placeholder) {
        placeholder.textContent = value !== '' ? '— Clear —' : 'Select rider';
      }

      // A rider selected in one position is disabled everywhere else in this
      // event, which prevents duplicates without extra validation dialogs.
      for (const option of Array.from(select.options)) {
        if (option.value === '') {
          option.disabled = false;
          continue;
        }
        option.disabled =
          selectedRiders.has(option.value) && option.value !== value;
      }

      row.classList.toggle('position-row--filled', value !== '');
    }
  }

  sync();

  return { element: section, view: { sync } };
}

/**
 * Build the remaining-events editor. The DOM is created once and updated in
 * place on store changes so open weekends, scroll position, and focus survive.
 */
export function createRaceEditor({
  season,
  store,
}: RaceEditorOptions): HTMLElement {
  const root = el('div', 'race-editor');
  const editorRiders = sortRidersByStanding(
    season.riders.filter((rider) => rider.availableForRemainingEvents),
    season.startingStandings,
  );
  const rounds = groupEventsByRound(season.remainingEvents);
  const views: SessionView[] = [];

  rounds.forEach((group, groupIndex) => {
    const details = el('details', 'weekend');
    details.open = groupIndex === 0;

    const summary = el('summary', 'weekend__summary');
    const summaryMain = el('span', 'weekend__main');
    const roundLabel = el('span', 'weekend__round', `Round ${group.round}`);
    const name = el('span', 'weekend__name', group.name);
    const meta = el(
      'span',
      'weekend__meta',
      `${group.circuit} · ${group.country} · ${formatDateRange(
        group.startDate,
        group.endDate,
      )}`,
    );
    summaryMain.append(roundLabel, name, meta);
    summary.append(summaryMain);

    details.append(summary);

    for (const event of group.events) {
      const session = createSession(event, season, store, editorRiders);
      details.append(session.element);
      views.push(session.view);
    }

    root.append(details);
  });

  store.subscribe(() => {
    for (const view of views) {
      view.sync();
    }
  });

  return root;
}
