import './styles.css';
import { season2026 } from './data/season';
import { createScenarioStore } from './state/scenario';
import {
  createShareUrl,
  parseShareSearch,
  summarizeShareImport,
} from './state/share-link';
import { el } from './ui/dom';
import { createRaceEditor } from './ui/render-races';
import { createMiniStandings } from './ui/render-mini-standings';
import { createStandingsPanel } from './ui/render-standings';
import { createShareNotice } from './ui/share-notice';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('App root element "#app" is missing');
}

const store = createScenarioStore(season2026);

// Read any predictions from a shared link before the editor is built, so the
// dropdowns render with the shared picks already selected.
const sharedImport = parseShareSearch(window.location.search, season2026);
if (Object.keys(sharedImport.results).length > 0) {
  store.setScenario({ results: sharedImport.results });
}
const sharedSummary = summarizeShareImport(sharedImport, season2026);

const page = el('main', 'page');

const masthead = el('header', 'masthead');
const eyebrow = el('p', 'eyebrow', `MotoGP · ${season2026.year}`);
const title = el('h1', '', 'MotoGP Calculator');
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
  'Fill any position in any order. A rider already chosen in a session is disabled in its other positions. Clearing one position leaves the rest untouched, and partial results score only the filled positions. Your picks are written into the page URL, ready to copy or share.',
);
racesHeader.append(racesHeading, racesNote);

racesPanel.append(racesHeader, createRaceEditor({ season: season2026, store }));

const standingsPanel = createStandingsPanel({ season: season2026, store });
const miniStandings = createMiniStandings({ season: season2026, store });

layout.append(racesPanel, standingsPanel);
page.append(masthead);
if (sharedSummary) {
  page.append(createShareNotice(sharedSummary));
}
page.append(miniStandings, layout);
app.replaceChildren(page);

// Keep the address bar in step with the editor. `replaceState` avoids adding a
// history entry for every dropdown change, so Back still leaves the page.
function syncAddressBar(): void {
  const url = createShareUrl(
    window.location.href,
    season2026,
    store.getScenario(),
  );
  if (url !== window.location.href) {
    window.history.replaceState(null, '', url);
  }
}

store.subscribe(syncAddressBar);
syncAddressBar();
