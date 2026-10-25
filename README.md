# MotoGP Calculator

A small, static web app for entering hypothetical finishing positions for the
remaining MotoGP Sprint and Grand Prix races and seeing the resulting
championship standings and projected champion.

## Requirements

- Node.js 20.8 or newer (Vite 6 requires Node 18+ / 20+ / 22+)
- npm

## Local development

```bash
npm install
npm run dev
```

## Tests

```bash
npm run test        # single run
npm run test:watch  # watch mode
```

The suite covers the season data and validation layer in
`tests/season-data.test.ts`, the scoring engine in `tests/scoring.test.ts`, the
countback rules in `tests/tiebreak.test.ts`, championship aggregation in
`tests/championship.test.ts`, and the race-editor state rules in
`tests/scenario-state.test.ts`.

## Using the race editor

The remaining weekends are grouped by round and can be expanded or collapsed.
Sprint and Grand Prix sessions have one dropdown per scoring position:

- Fill positions from first place down. The next position unlocks once the
  previous one is filled.
- A rider already selected in a session is disabled in that session's other
  positions, so the same rider cannot occupy two positions.
- Selecting "— Clear —" in a position clears that position and every position
  after it.
- Each session shows whether it is not simulated, incomplete, or complete.
  Partial results are deliberate: only the filled positions score, and the
  standings panel calls out incomplete sessions.
- The projected standings are recalculated from the starting standings plus the
  current scenario after every change. They are never stored separately.

Only scoring positions are editable (the top 9 in a Sprint and the top 15 in a
Grand Prix). Deeper classifications do not award points and are not modelled in
the editor.

### Scoring engine assumptions

The pure calculation functions live in `src/domain/` and are independent of the
DOM:

- `scoring.ts` maps finishing positions to the configured Sprint or Grand Prix
  points table. Positions outside the scoring range score zero.
- `championship.ts` adds simulated points to the starting standings and returns
  the projected order, champion, runner-up, and points gap.
- `tiebreak.ts` implements countback: Grand Prix placings are compared first
  (wins, then seconds, and so on), followed by Sprint placings. The checked-in
  classification ranks Marini ahead of Binder on 108 points because of a Grand
  Prix fifth place, which confirms that ordering.
- Unsimulated events award nothing. Partial results score only the listed
  positions, so an unfilled position awards no points. If the data still cannot
  separate two riders, the cutoff order and then rider ID provide a
  deterministic fallback; that deeper tie-break is not modelled yet.

## Production build

```bash
npm run build    # type-check, then bundle into dist/
npm run preview  # serve the production build locally
```

## Season data

The 2026 season is defined in `src/data/season-2026.json` and validated when
the app starts and in the tests. The validation lives in
`src/domain/validation.ts`; the validated object is exported from
`src/data/season.ts`.

Each rider also carries `color` and `textColor` (both `#rrggbb`) for the number
badge in the standings. These are snapshotted from the MotoGP live timing feed
(`/motogp/v1/timing-gateway/livetiming-lite`). The feed is not requested at
runtime: it only allows browser requests from `motogp.com` origins, so a static
GitHub Pages build cannot read it. Riders absent from the current session use
the colours of their team-mates from the same feed, or the official team
colours when the team is not represented.

### Updating the season data

1. Replace or refresh the values in `src/data/season-2026.json`.
2. Update `meta.standingsCutoff`, `meta.standingsCutoffRound`, and
   `meta.standingsCutoffLabel`, and refresh the source URLs.
3. Refresh each rider's `color` and `textColor` from the live timing feed when
   liveries change.
4. Keep rider and event IDs stable; URLs and saved scenarios will rely on
   them. Add new riders/events rather than renaming existing IDs.
5. Mark riders who will not take part in the remaining rounds with
   `"availableForRemainingEvents": false`.
6. Run `npm run test` and `npm run build`. Validation rejects duplicate IDs,
   unknown rider references, malformed points tables, events before the
   cutoff, and standings that are not in official order.


## Deployment

The app is a client-side-only static site deployed to GitHub Pages by
`.github/workflows/deploy.yml`. Every push to `master` runs the tests, builds
`dist`, and publishes it as a Pages artifact (the workflow can also be started
manually from the Actions tab).

One-time repository setup: in **Settings → Pages**, set **Source** to
**GitHub Actions**. Because `vite.config.ts` uses a relative `base`, the build
works at both `https://<user>.github.io/<repo>/` and a custom domain root.
