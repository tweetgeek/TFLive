import { createApp } from 'vue';
import App from './App.vue';
import { startRouting } from './state/route';
import { createStore, STORE_KEY, wsUrl, type WebSocketLike } from './state/store';
import './styles.css';

const store = createStore({
  url: wsUrl(window.location),
  wsFactory: (u): WebSocketLike => {
    const ws = new WebSocket(u);
    return {
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null,
      close: () => ws.close(),
    };
  },
  fetch: (i, init) => fetch(i, init),
});
startRouting(window);
store.connect();
createApp(App).provide(STORE_KEY, store).mount('#app');
