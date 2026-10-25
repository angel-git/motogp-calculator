import './styles.css';
import { season2026 } from './data/season';

const app = document.querySelector<HTMLDivElement>('#app');

if (app) {
  const rounds = new Set(season2026.remainingEvents.map((event) => event.round)).size;
  const activeRiders = season2026.riders.filter(
    (rider) => rider.availableForRemainingEvents,
  ).length;

  app.innerHTML = `
    <main class="page">
      <header class="masthead">
        <p class="eyebrow">MotoGP · ${season2026.year}</p>
        <h1>Championship Predictor</h1>
        <p class="lede">
          Simulate the remaining Sprint and Grand Prix results to project the
          final championship standings.
        </p>
      </header>
      <section class="placeholder" aria-live="polite">
        <p class="placeholder__label">Season data ready</p>
        <p>
          ${season2026.remainingEvents.length} remaining sessions across
          ${rounds} rounds, with ${activeRiders} available riders.
        </p>
        <p>
          The scoring engine and race editor are coming in the next milestones.
        </p>
      </section>
    </main>
  `;
}
