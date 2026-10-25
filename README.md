# MotoGP Calculator

A small, static web app for entering hypothetical finishing positions for the
remaining MotoGP Sprint and Grand Prix races and seeing the resulting
championship standings and projected champion.

See it live here: https://angel-git.github.io/motogp-calculator/


<img width="1408" height="885" alt="Screenshot 2026-10-25 at 22 20 08" src="https://github.com/user-attachments/assets/63fc1d71-5bbb-41c3-8149-93315e6dbf96" />


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
`tests/championship.test.ts`, the race-editor state rules in
`tests/scenario-state.test.ts`, and share-link encoding in
`tests/share-link.test.ts`.

## Using the race editor

The remaining weekends are grouped by round and can be expanded or collapsed.
Sprint and Grand Prix sessions have one dropdown per scoring position:

- Fill positions in any order. Every position is editable from the start, and
  unfilled positions inside a result are left open.
- A rider already selected in a session is disabled in that session's other
  positions, so the same rider cannot occupy two positions.
- Selecting "— Clear —" in a position clears only that position. The positions
  before and after it keep their riders.
- Each session shows whether it is not simulated, incomplete, or complete.
  Partial results are deliberate: only the filled positions score, and the
  standings panel calls out incomplete sessions.
- The projected standings are recalculated from the starting standings plus the
  current scenario after every change. They are never stored separately.
- On narrow screens the full standings table sits below the editor. A compact
  top-three summary sticks to the top of the viewport, showing each rider's
  number, name, total, and simulated points, so the championship impact stays
  visible while selecting riders.

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

## Sharing predictions

The page URL always reflects the current picks. Every dropdown change rewrites
the address bar, and opening a link pre-fills the editor with those predictions.
Use the browser's own share action or copy the address bar to send the link.
The URL is updated with `history.replaceState`, so editing does not add a new
browser-history entry for every selection.

Each simulated session becomes one query parameter named after its event ID,
with the rider IDs in finishing order:

```
?p.2026-19-malaysia-sprint=marc-marquez,jorge-martin&p.2026-19-malaysia-grand-prix=marc-marquez
```

An underscore marks an unfilled position inside a partial result. The link also
records the format version (`v`), season (`y`), and standings cutoff (`c`).
Unrelated query parameters are preserved.

Shared predictions are applied against the data currently deployed. A session
that has since been completed is no longer in `remainingEvents`, so its
predictions are ignored and the official result is used instead. Individual
picks for riders who are no longer in the remaining field are also dropped. The
app shows a notice explaining what was applied and what was skipped, including
when the link was made against an earlier standings cutoff. The URL is then
rewritten to match what is actually shown.

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
