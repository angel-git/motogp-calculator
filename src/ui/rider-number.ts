import type { Rider } from '../domain/types';
import { el } from './dom';

/**
 * Number badge shared by the full standings table and the compact summary.
 * Colours come from the season data and keep the rider's number legible.
 */
export function createRiderNumber(rider: Rider | undefined): HTMLElement {
  const number = el('span', 'rider-number');
  if (rider) {
    number.textContent = String(rider.number);
    number.style.backgroundColor = rider.color;
    number.style.color = rider.textColor;
    number.setAttribute('aria-label', `Number ${rider.number}`);
  }
  return number;
}
