import type { ShareSummary } from '../state/share-link';
import { el } from './dom';

/** Dismissible notice explaining how a shared link was applied. */
export function createShareNotice(summary: ShareSummary): HTMLElement {
  const notice = el('div', `notice notice--${summary.tone}`);
  notice.setAttribute('role', 'status');

  const text = el('p', 'notice__text', summary.message);
  const dismiss = el('button', 'notice__dismiss', '×');
  dismiss.type = 'button';
  dismiss.setAttribute('aria-label', 'Dismiss shared prediction notice');
  dismiss.addEventListener('click', () => notice.remove());

  notice.append(text, dismiss);
  return notice;
}
