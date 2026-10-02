import { reactive } from 'vue';

export type ViewId = 'przeglad' | 'alerty' | 'linie' | 'pojazdy' | 'przemysl' | 'miasta';

export const VIEWS: readonly { id: ViewId; label: string; emoji: string }[] = [
  { id: 'przeglad', label: 'Przegląd', emoji: '📊' },
  { id: 'alerty', label: 'Alerty', emoji: '🔔' },
  { id: 'linie', label: 'Linie', emoji: '🛤️' },
  { id: 'pojazdy', label: 'Pojazdy', emoji: '🚆' },
  { id: 'przemysl', label: 'Przemysł', emoji: '🏭' },
  { id: 'miasta', label: 'Miasta', emoji: '🏙️' },
];

export function viewFromHash(hash: string): ViewId {
  const id = hash.replace(/^#\/?/, '');
  return (VIEWS.find((v) => v.id === id)?.id ?? 'przeglad') as ViewId;
}

export const route = reactive<{ view: ViewId }>({ view: 'przeglad' });

export function startRouting(win: Window): void {
  route.view = viewFromHash(win.location.hash);
  win.addEventListener('hashchange', () => {
    route.view = viewFromHash(win.location.hash);
  });
}
