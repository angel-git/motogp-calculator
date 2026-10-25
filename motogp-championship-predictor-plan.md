# MotoGP Championship Predictor --- Implementation Plan

## 1. Goal

Build a small, responsive web app where users enter hypothetical
finishing positions for the remaining MotoGP Sprint races and Grand Prix
races, then see the resulting championship standings and projected
champion.

**Deployment target:** GitHub Pages\
**Stack:** Vite + TypeScript + HTML + CSS\
**Architecture:** Static, client-side only; no backend or database\
**Initial season:** 2026, with season data kept separate from
application logic

## 2. Product scope

### MVP

-   Show the current championship standings as the starting point.
-   List each remaining race weekend.
-   Let users enter finishing orders for each remaining Sprint and Grand
    Prix.
-   Prevent a rider from being assigned to more than one position in the
    same event.
-   Recalculate championship points and standings immediately when a
    result changes.
-   Highlight the projected champion, points total, and gap to the
    runner-up.
-   Provide reset/clear controls for hypothetical results.
-   Work on desktop and mobile.
-   Deploy automatically to GitHub Pages through GitHub Actions.

### Good follow-up features

-   Share a scenario through a URL.
-   Save and restore scenarios using browser storage.
-   Add a "championship possibilities" view showing which riders can
    still mathematically win.
-   Add scenario presets, such as "current leader wins every race" or
    "favourite rider wins out."
-   Add a data-update guide or optional data import workflow.

### Explicitly out of scope for the first version

-   User accounts, a server, or a database.
-   Live timing or automatic live results ingestion.
-   Complex visualizations before the scoring engine is validated.

## 3. Recommended technical choices

-   **Vite:** local development server and production build.
-   **TypeScript:** typed domain models and safer refactoring.
-   **Vitest:** unit tests for scoring, standings, and tie-break
    behaviour.
-   **Plain CSS:** enough for a responsive motorsport-inspired interface
    without adding a UI framework.
-   **GitHub Actions:** build and deploy the `dist/` directory to GitHub
    Pages.

Avoid React initially. The UI is interactive but small enough for
TypeScript modules and DOM rendering. Add a UI framework only if the
interface becomes significantly more complex.

## 4. Project structure

``` text
motogp-predictor/
├── public/
│   └── favicon.svg
├── src/
│   ├── main.ts
│   ├── styles.css
│   ├── data/
│   │   └── season-2026.json
│   ├── domain/
│   │   ├── types.ts
│   │   ├── scoring.ts
│   │   ├── championship.ts
│   │   └── tiebreak.ts
│   ├── state/
│   │   └── scenario.ts
│   └── ui/
│       ├── render-races.ts
│       ├── render-standings.ts
│       └── controls.ts
├── tests/
│   ├── scoring.test.ts
│   ├── championship.test.ts
│   └── tiebreak.test.ts
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

Keep the domain/calculation code independent from the DOM. That makes
the engine easy to test and allows the UI to be redesigned without
changing scoring rules.

## 5. Domain model

Use stable rider IDs rather than names as identifiers. Names, team
names, and display order belong in season data.

Suggested concepts:

-   `Rider`: ID, display name, team, optional number.
-   `Season`: season year, riders, scoring rules, current standings,
    completed results, and remaining events.
-   `Event`: unique ID, round number, circuit/name, date, and event type
    (`sprint` or `grandPrix`).
-   `RaceResult`: event ID and an ordered list of rider IDs, with
    explicit representation for non-finishers or unassigned positions if
    needed.
-   `Scenario`: hypothetical results keyed by event ID.
-   `Standing`: rider ID, points, and any data required for official
    countback.

Keep scoring tables in configuration rather than scattering point values
through the code. Validate season data at startup or in tests so invalid
rider IDs, duplicate event IDs, or malformed standings are caught early.

## 6. Championship calculation rules

This is the most important part of the project. Implement and test it
before building the full interface.

### Scoring

-   Keep Sprint and Grand Prix points tables separate.
-   Use the official points allocation for the selected season.
-   Apply points only to eligible finishing positions and according to
    the official classification rules.
-   Make assumptions about retirements, disqualifications, penalties,
    and non-classified riders explicit.
-   Avoid hardcoding the current season's remaining rounds inside the
    calculation engine.

### Calculation flow

1.  Start with the official points already earned before the simulated
    events.
2.  Take the user's hypothetical result for each remaining event.
3.  Award points according to that event's type.
4.  Add the simulated points to each rider's existing total.
5.  Sort the final standings by points, then by the official
    championship tie-break rules.
6.  Return standings and useful summary information, including champion,
    runner-up, and points gap.

Prefer a pure function with no side effects, for example:

``` ts
calculateChampionship(
  startingStandings,
  events,
  scenario,
  scoringRules
): Standing[]
```

The exact types can be refined during implementation. The function
should not read or write the DOM, access browser storage, or fetch data.

### Tie-breaks

Do not assume that equal points mean a shared title or simply sort
alphabetically. Implement the official countback rule for the season,
based on the relevant race results and classification rules. Add tests
for ties and document any edge cases the first version does not model.

### Input validation

-   A rider cannot occupy multiple positions in the same event.
-   Unknown rider IDs must be rejected.
-   An incomplete hypothetical result should be handled deliberately; it
    must not silently count missing positions as zero or as a real
    finishing order.
-   If a user leaves an event unconfigured, define whether it is treated
    as "not simulated yet" or uses a clearly documented default.
-   Do not let invalid inputs produce misleading champion predictions.

## 7. User interface plan

### Main layout

1.  **Header:** app title, season, and a short explanation.
2.  **Champion summary:** projected champion, projected points, and lead
    over second place.
3.  **Championship table:** rider, current points, simulated points,
    projected total, and position change.
4.  **Remaining events:** expandable cards or sections for each weekend.
5.  **Scenario controls:** clear predictions, reset to starting state,
    and later share/save.

### Race editor

-   Give each remaining Sprint and Grand Prix its own result editor.
-   A straightforward first version can use one dropdown per finishing
    position.
-   Once a rider is selected, remove or disable that rider in the other
    position dropdowns for the same event.
-   Include clear labels and keyboard-accessible controls.
-   Show whether the event is incomplete or valid.
-   Recalculate after valid changes, without a separate submit button.

For a small number of remaining rounds, clarity is more valuable than a
complicated drag-and-drop interface. Drag-and-drop can be considered
later.

### Visual direction

Use a dark, high-contrast motorsport-inspired theme with a restrained
red accent, strong typography, compact standings, and clear position
indicators. Avoid relying on colour alone to communicate ranking or
status. Ensure mobile layouts remain usable for editing results and
reading the standings.

## 8. State and persistence

For the MVP, keep the scenario in in-memory application state and derive
the standings from that state. Do not store calculated standings as a
separate source of truth; recalculate them from starting data plus
scenario inputs.

Possible later additions:

-   **URL sharing:** serialize only the scenario using stable
    rider/event IDs, encode it into a query parameter or URL fragment,
    and validate it when loading.
-   **Local persistence:** save scenario inputs to `localStorage`, with
    a schema/version field so old saved scenarios can be safely ignored
    or migrated.
-   Provide an explicit reset action.

Do not put secrets or private data in the URL. This project should not
need secrets at all.

## 9. Season data maintenance

Keep season-specific information in `src/data/season-2026.json`:

-   Rider list and stable IDs.
-   Official starting standings at the chosen cutoff.
-   Completed event results if needed for tie-break calculations.
-   Remaining Sprint and Grand Prix events.
-   Scoring tables and relevant rule/version metadata.

Record the date and source used for the starting standings. Verify the
calendar, completed results, points, and tie-break rules against
official MotoGP championship sources before publishing. Treat season
data as maintained input, not as facts guaranteed to remain current
automatically.

For future seasons, add a new season data file or a small
season-selection mechanism without rewriting the engine.

## 10. Testing strategy

Use Vitest for the domain layer.

### Scoring tests

-   First-place Sprint and Grand Prix points differ as expected.
-   Every scored position receives the correct configured points.
-   Positions outside the scoring range receive no points.
-   Invalid event types or unknown riders are rejected.

### Championship tests

-   A rider's final total equals starting points plus points from
    simulated events.
-   Changing a hypothetical result updates the expected totals.
-   Unsimulated events do not accidentally award points.
-   Sorting by points is correct.
-   Existing points are not added twice.

### Validation and tie-break tests

-   Duplicate riders in one event are rejected.
-   Incomplete event results are handled as specified.
-   Equal-points standings use the official countback rule.
-   Scenarios with no valid simulated events behave sensibly.

Use a few manually verified examples as regression fixtures. Avoid tests
that only repeat the implementation's own assumptions.

## 11. Implementation milestones

### Milestone 1 --- Scaffold

-   Create a Vite TypeScript project.
-   Add Vitest.
-   Set up linting/formatting if desired.
-   Confirm local development and production build work.

**Done when:** `npm run dev`, `npm run test`, and `npm run build` work.

### Milestone 2 --- Season data and domain types

-   Define rider, event, scenario, and standings types.
-   Add the season data file.
-   Validate IDs and data shape.
-   Document the starting-standings cutoff and sources.

**Done when:** season data loads and passes validation.

### Milestone 3 --- Scoring engine

-   Implement Sprint and Grand Prix scoring.
-   Implement championship aggregation and sorting.
-   Implement official countback behaviour.
-   Add unit tests for normal and edge cases.

**Done when:** known scenarios produce manually verified results.

### Milestone 4 --- Race editor

-   Render remaining events.
-   Add position selectors and duplicate-rider prevention.
-   Track incomplete/valid events.
-   Recalculate standings from scenario state.

**Done when:** editing an event changes the predicted standings
correctly.

### Milestone 5 --- Standings and polish

-   Add champion summary and championship table.
-   Show current points, simulated points, total, and position changes.
-   Add reset/clear controls.
-   Make the layout responsive and accessible.

**Done when:** a user can complete a scenario and understand why the
projected standings changed.

### Milestone 6 --- GitHub Pages deployment

-   Configure Vite's `base` path for the repository URL.
-   Add a GitHub Actions workflow to install dependencies, run tests,
    build, and deploy `dist/`.
-   Enable GitHub Pages to use GitHub Actions.
-   Test the deployed site, including refreshes and direct links.

**Done when:** every change to the main branch can be deployed
automatically and the public page works.

### Milestone 7 --- Optional improvements

-   Shareable scenario URLs.
-   Local save/restore.
-   Mathematical title-clinching and elimination analysis.
-   Season selector and a repeatable data-update process.

## 12. GitHub Pages details

A Vite app is a static site after building, so no server is required.

-   Configure `base` to match the repository path when deploying to
    `https://<username>.github.io/<repository>/`.
-   If using a user/organization site at
    `https://<username>.github.io/`, the base path is typically `/`.
-   Deploy the generated `dist/` directory using GitHub Actions.
-   Run tests before deployment so an invalid scoring change does not
    automatically publish.
-   Keep the app compatible with static hosting; avoid backend-dependent
    routing.

## 13. Definition of done for v1

-   [ ] Season starting standings and remaining events are verified.
-   [ ] Sprint and Grand Prix points are calculated separately.
-   [ ] Championship totals are calculated from starting points plus
    hypothetical results.
-   [ ] Official countback rules are represented and tested.
-   [ ] Duplicate and incomplete result inputs are handled clearly.
-   [ ] The champion and complete projected standings update when valid
    inputs change.
-   [ ] Unit tests and production build pass.
-   [ ] Layout works on desktop and mobile.
-   [ ] GitHub Pages deployment is automated.
-   [ ] README explains local development, tests, deployment, and how to
    update season data.

## 14. First commands

``` bash
npm create vite@latest motogp-predictor -- --template vanilla-ts
cd motogp-predictor
npm install
npm install -D vitest
npm run dev
```

Then add a test script to `package.json`, for example:

``` json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest"
  }
}
```

Check the generated `package.json` and TypeScript configuration before
replacing anything; preserve scripts Vite generated that are still
useful.

## Recommended build order

**Start with the data model and pure scoring engine, not the UI.** A
polished interface is easy to change; a subtly incorrect championship
calculation makes the whole predictor untrustworthy. Once the engine
passes known-result tests, the race editor and live standings become
straightforward.
