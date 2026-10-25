import './styles.css';
import { season2026 } from './data/season';
import { createScenarioStore } from './state/scenario';
import { el } from './ui/dom';
import { createRaceEditor } from './ui/render-races';
import { createMiniStandings } from './ui/render-mini-standings';
import { createStandingsPanel } from './ui/render-standings';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('App root element "#app" is missing');
}

const store = createScenarioStore(season2026);

const page = el('main', 'page');

const masthead = el('header', 'masthead');
const eyebrow = el('p', 'eyebrow', `MotoGP · ${season2026.year}`);
const title = el('h1', '', 'Championship Predictor');
const lede = el(
  'p',
  'lede',
  'Simulate the remaining Sprint and Grand Prix results to project the final championship standings.',
);
masthead.append(eyebrow, title, lede);

const layout = el('div', 'app-layout');

const racesPanel = el('section', 'panel races-panel');
racesPanel.setAttribute('aria-labelledby', 'races-heading');
const racesHeader = el('div', 'panel__header');
const racesHeading = el('h2', 'panel__title', 'Remaining events');
racesHeading.id = 'races-heading';
const racesNote = el(
  'p',
  'panel__note',
  'Fill any position in any order. A rider already chosen in a session is disabled in its other positions. Clearing one position leaves the rest untouched, and partial results score only the filled positions.',
);
racesHeader.append(racesHeading, racesNote);

racesPanel.append(racesHeader, createRaceEditor({ season: season2026, store }));

const standingsPanel = createStandingsPanel({ season: season2026, store });
const miniStandings = createMiniStandings({ season: season2026, store });

layout.append(racesPanel, standingsPanel);
page.append(masthead, miniStandings, layout);
app.replaceChildren(page);
