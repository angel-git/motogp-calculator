import './styles.css';

const app = document.querySelector<HTMLDivElement>('#app');

if (app) {
  app.innerHTML = `
    <main class="page">
      <header class="masthead">
        <p class="eyebrow">MotoGP · 2026</p>
        <h1>Championship Predictor</h1>
        <p class="lede">
          Simulate the remaining Sprint and Grand Prix results to project the
          final championship standings.
        </p>
      </header>
      <section class="placeholder" aria-live="polite">
        <p class="placeholder__label">Work in progress</p>
        <p>
          The season data, scoring engine, and race editor are coming in the
          next milestones.
        </p>
      </section>
    </main>
  `;
}
