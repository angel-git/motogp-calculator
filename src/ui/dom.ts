/** Small DOM helpers shared by the UI modules. */

/**
 * Create an element with an optional class name and text content. Using
 * `textContent` keeps data from the season file out of HTML parsing.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

/** Format an ISO date as, for example, "Sat 31 Oct". */
export function formatEventDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
    timeZone: 'UTC',
  }).format(date);
}

/** Format an inclusive ISO date range as, for example, "31 Oct – 1 Nov". */
export function formatDateRange(start: string, end: string): string {
  if (start === end) {
    return formatEventDate(start);
  }

  const format = (isoDate: string) =>
    new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(`${isoDate}T00:00:00Z`));

  return `${format(start)} – ${format(end)}`;
}
