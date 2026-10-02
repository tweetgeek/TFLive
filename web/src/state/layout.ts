import { reactive } from 'vue';

export const WIDE_QUERY = '(min-width: 1800px) and (min-height: 900px)';

export const layout = reactive<{ wide: boolean }>({ wide: false });

export function startLayout(win: { matchMedia?: (q: string) => MediaQueryList }): void {
  if (typeof win.matchMedia !== 'function') return;
  const mq = win.matchMedia(WIDE_QUERY);
  layout.wide = mq.matches;
  mq.addEventListener('change', (e) => {
    layout.wide = e.matches;
  });
}
