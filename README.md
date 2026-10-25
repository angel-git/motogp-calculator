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
`tests/season-data.test.ts`, plus the scoring engine in `tests/scoring.test.ts`,
the countback rules in `tests/tiebreak.test.ts`, and championship aggregation in
`tests/championship.test.ts`.

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

### Updating the season data

1. Replace or refresh the values in `src/data/season-2026.json`.
2. Update `meta.standingsCutoff`, `meta.standingsCutoffRound`, and
   `meta.standingsCutoffLabel`, and refresh the source URLs.
3. Keep rider and event IDs stable; URLs and saved scenarios will rely on
   them. Add new riders/events rather than renaming existing IDs.
4. Mark riders who will not take part in the remaining rounds with
   `"availableForRemainingEvents": false`.
5. Run `npm run test` and `npm run build`. Validation rejects duplicate IDs,
   unknown rider references, malformed points tables, events before the
   cutoff, and standings that are not in official order.


## Deployment

The app is a client-side-only static site intended for GitHub Pages. Automated
deployment via GitHub Actions is part of a later milestone.
