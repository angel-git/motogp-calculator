import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the built site works both at the domain root and under
  // a GitHub Pages repository path. Milestone 6 will pin the exact repository
  // path if needed.
  base: './',
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Domain tests arrive with the scoring engine (Milestone 3); until then the
    // test suite is legitimately empty.
    passWithNoTests: true,
  },
});
