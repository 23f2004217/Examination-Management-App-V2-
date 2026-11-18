import { computed } from '../vue.js';
import { route, useRoute } from '../router.js';
import { pageMeta } from '../pageMeta.js';
import { badgeClass } from '../format.js';

export const PageHeader = {
  props: ['title', 'subtitle'],
  setup() {
    const route = useRoute();
    return { meta: computed(() => pageMeta[route.path] || {}) };
  },
  template: `
  <div class="page-header">
    <div>
      <h1>{{ title || meta.title }}</h1>
      <div class="page-sub" v-if="subtitle || meta.sub">{{ subtitle || meta.sub }}</div>
    </div>
    <div class="page-actions"><slot /></div>
  </div>`,
};

export const HeroBanner = {
  props: ['title', 'subtitle'],
  template: `
  <div class="hero-banner mb-4 d-flex flex-wrap justify-content-between align-items-center gap-3">
    <div>
      <h1>{{ title }}</h1>
      <div class="opacity-90">{{ subtitle }}</div>
    </div>
    <div class="hero-actions"><slot /></div>
  </div>`,
};

export const LoadingBlock = {
  template: `<div class="text-center py-5" role="status" aria-live="polite"><div class="spinner-border text-primary"></div><span class="visually-hidden">Loading...</span></div>`,
};

export const EmptyRow = {
  props: { colspan: { type: Number, default: 1 }, icon: { type: String, default: 'bi-inbox' }, text: String, compact: Boolean },
  template: `
  <tr><td :colspan="colspan" class="empty-state" :class="{ compact }">
    <div class="empty-icon"><i :class="'bi ' + icon"></i></div>
    <div>{{ text }}</div>
  </td></tr>`,
};

export const FilterBar = {
  props: ['modelValue', 'placeholder', 'autofocus'],
  emits: ['update:modelValue'],
  mounted() { if (this.autofocus && this.$refs.input) this.$refs.input.focus(); },
  template: `
  <div class="card filter-bar">
    <div v-if="placeholder" class="input-group filter-search">
      <span class="input-group-text bg-white text-muted"><i class="bi bi-search"></i></span>
      <input ref="input" class="form-control border-start-0" :placeholder="placeholder" :aria-label="placeholder"
             :value="modelValue" @input="$emit('update:modelValue', $event.target.value)">
    </div>
    <slot />
  </div>`,
};

export const StatCard = {
  props: ['label', 'value', 'icon', 'tone'],
  template: `
  <div class="card-stat" :class="'tone-' + (tone || 'blue')">
    <div class="stat-icon"><i :class="'bi ' + icon"></i></div>
    <div class="stat-label">{{ label }}</div>
    <div class="stat-value">{{ value ?? '-' }}</div>
  </div>`,
};

export const StatusBadge = {
  props: ['status'],
  methods: { badgeClass },
  template: `<span class="badge-soft" :class="badgeClass(status)">{{ status }}</span>`,
};

export const SeatMeter = {
  props: ['booked', 'capacity'],
  template: `
  <div class="seat-meter">
    <div class="progress" role="progressbar" :aria-valuenow="booked" aria-valuemin="0" :aria-valuemax="capacity">
      <div class="progress-bar" :style="{ width: (capacity ? (booked / capacity) * 100 : 0) + '%' }"></div>
    </div>
    <span class="small fw-semibold">{{ booked }}/{{ capacity }}</span>
  </div>`,
};
