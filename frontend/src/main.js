import './registerSW.js';
import { createApp } from './vue.js';
import { App } from './App.js';
import { RouterLink, RouterView, router } from './router.js';
import { EmptyRow, FilterBar, HeroBanner, LoadingBlock, PageHeader, SeatMeter, StatCard, StatusBadge } from './components/PageBlocks.js';

const vueApp = createApp(App);

vueApp.component('router-view', RouterView);

vueApp.component('router-link', RouterLink);

Object.entries({ PageHeader, HeroBanner, LoadingBlock, EmptyRow, FilterBar, StatCard, StatusBadge, SeatMeter })
  .forEach(([name, component]) => vueApp.component(name, component));

router.push(location.pathname, true);

vueApp.mount('#app');
