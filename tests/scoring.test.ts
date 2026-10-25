import { describe, expect, it } from 'vitest';
import {
  pointsForPosition,
  pointsTable,
  scoreEvent,
  ScoringError,
} from '../src/domain/scoring';
import type { EventType, ScoringRules } from '../src/domain/types';

const RULES: ScoringRules = {
  grandPrix: [25, 20, 16, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
  sprint: [12, 9, 7, 6, 5, 4, 3, 2, 1],
};

describe('scoring tables', () => {
  it('uses separate Sprint and Grand Prix tables', () => {
    expect(pointsForPosition('grandPrix', 1, RULES)).toBe(25);
    expect(pointsForPosition('sprint', 1, RULES)).toBe(12);
    expect(pointsTable('grandPrix', RULES)).toEqual(RULES.grandPrix);
    expect(pointsTable('sprint', RULES)).toEqual(RULES.sprint);
  });

  it('awards the configured points at every scoring position', () => {
    RULES.grandPrix.forEach((points, index) => {
      expect(pointsForPosition('grandPrix', index + 1, RULES)).toBe(points);
    });
    RULES.sprint.forEach((points, index) => {
      expect(pointsForPosition('sprint', index + 1, RULES)).toBe(points);
    });
  });

  it('awards no points outside the scoring range', () => {
    expect(pointsForPosition('grandPrix', 16, RULES)).toBe(0);
    expect(pointsForPosition('grandPrix', 24, RULES)).toBe(0);
    expect(pointsForPosition('sprint', 10, RULES)).toBe(0);
    expect(pointsForPosition('sprint', 21, RULES)).toBe(0);
  });

  it('rejects invalid positions and event types', () => {
    for (const position of [0, -1, 1.5, Number.NaN]) {
      expect(() => pointsForPosition('grandPrix', position, RULES)).toThrow(
        RangeError,
      );
    }

    expect(() =>
      pointsForPosition('qualifying' as EventType, 1, RULES),
    ).toThrow(ScoringError);
    expect(() => pointsTable('qualifying' as EventType, RULES)).toThrow(
      ScoringError,
    );
  });
});

describe('scoreEvent', () => {
  it('maps every finishing position, including non-scoring positions', () => {
    const order = Array.from({ length: 16 }, (_, index) => `rider-${index + 1}`);
    const finishes = scoreEvent('grandPrix', order, RULES);

    expect(finishes).toHaveLength(16);
    expect(finishes[0]).toEqual({ riderId: 'rider-1', position: 1, points: 25 });
    expect(finishes[14]).toEqual({
      riderId: 'rider-15',
      position: 15,
      points: 1,
    });
    expect(finishes[15]).toEqual({
      riderId: 'rider-16',
      position: 16,
      points: 0,
    });

    expect(scoreEvent('sprint', order.slice(0, 10), RULES)[9]).toEqual({
      riderId: 'rider-10',
      position: 10,
      points: 0,
    });
  });

  it('skips unfilled slots without shifting the riders after them', () => {
    const finishes = scoreEvent('grandPrix', [null, 'rider-1', null, 'rider-2'], RULES);

    expect(finishes).toEqual([
      { riderId: 'rider-1', position: 2, points: 20 },
      { riderId: 'rider-2', position: 4, points: 13 },
    ]);
  });

  it('rejects duplicate riders and empty rider IDs', () => {
    expect(() =>
      scoreEvent('grandPrix', ['marc-marquez', 'marc-marquez'], RULES),
    ).toThrow(ScoringError);
    expect(() => scoreEvent('sprint', [''], RULES)).toThrow(ScoringError);
  });
});
