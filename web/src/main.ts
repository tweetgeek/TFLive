import { createApp } from 'vue';
import App from './App.vue';
import { startRouting } from './state/route';
import { browserWebSocket, createStore, STORE_KEY, wsUrl } from './state/store';
import './styles.css';

const store = createStore({
  url: wsUrl(window.location),
  wsFactory: browserWebSocket,
  fetch: (i, init) => fetch(i, init),
});
startRouting(window);
store.connect();
createApp(App).provide(STORE_KEY, store).mount('#app');
