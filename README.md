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

Domain tests will live in `tests/` and target the pure calculation modules in
`src/domain/`. The suite is empty until the scoring engine lands.

## Production build

```bash
npm run build    # type-check, then bundle into dist/
npm run preview  # serve the production build locally
```

## Deployment

The app is a client-side-only static site intended for GitHub Pages. Automated
deployment via GitHub Actions is part of a later milestone.
