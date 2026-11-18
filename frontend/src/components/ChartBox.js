import { computed, ref, onMounted, onBeforeUnmount, watch } from '../vue.js';

// Bar / line chart drawn with Chart.js (CDN). If Chart.js cannot be loaded (offline) it falls back to a plain inline SVG chart. Props: type ('bar' | 'line'), labels, values,
// title, accentColor. Whole-number axis, hover tooltips, screen-reader summary, "No data yet" when empty.
export const ChartBox = {
  props: ['type', 'labels', 'values', 'title', 'accentColor'],
  setup(props) {
    const canvas = ref(null);
    const hasChartJs = typeof Chart !== 'undefined';
    let chart = null;
    const W = 320, H = 210, L = 28, R = 8, T = 16, B = 30;
    const nums = computed(() => (props.values || []).map((v) => Number(v) || 0));
    const names = computed(() => (props.labels || []).map((x) => String(x)));
    const isLine = computed(() => props.type === 'line');
    const color = computed(() => props.accentColor || '#4f46e5');
    const summary = computed(() => (props.title || 'Chart') + ': ' + (nums.value.length
      ? nums.value.map((v, i) => (names.value[i] || '') + ' ' + v).join(', ') : 'no data'));
    const step = computed(() => Math.max(1, Math.ceil(Math.max(1, ...nums.value) / 4)));   // whole-number gridlines
    const top = computed(() => step.value * Math.ceil(Math.max(1, ...nums.value) / step.value));
    const ticks = computed(() => {
      const out = [];
      for (let v = 0; v <= top.value; v += step.value) out.push({ v, y: T + (H - T - B) * (1 - v / top.value) });
      return out;
    });
    const pts = computed(() => nums.value.map((v, i) => {
      const slot = (W - L - R) / nums.value.length;
      return { x: L + slot * (i + 0.5), y: T + (H - T - B) * (1 - v / top.value), v, slot, name: names.value[i] || '' };
    }));
    const every = computed(() => Math.ceil(nums.value.length / (isLine.value ? 6 : 12)));   // label thinning
    const short = (t) => (t.length > 12 ? t.slice(0, 11) + '…' : t);
    const linePath = computed(() => pts.value.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' '));
    const areaPath = computed(() => pts.value.length
      ? linePath.value + ` L${pts.value[pts.value.length - 1].x.toFixed(1)} ${H - B} L${pts.value[0].x.toFixed(1)} ${H - B} Z` : '');
    const draw = () => {
      if (chart) { chart.destroy(); chart = null; }
      if (!hasChartJs || !canvas.value || !nums.value.length) return;
      chart = new Chart(canvas.value, {
        type: isLine.value ? 'line' : 'bar',
        data: {
          labels: names.value,
          datasets: [{
            data: nums.value, borderColor: color.value, borderWidth: 2.5, tension: 0.25,
            backgroundColor: isLine.value ? color.value + '22' : color.value + 'D0',
            fill: isLine.value, borderRadius: isLine.value ? 0 : 5, pointRadius: nums.value.length <= 31 ? 3.5 : 0,
            pointBackgroundColor: '#fff', maxBarThickness: 46,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#f1f5f9' } },
            x: { grid: { display: false }, ticks: { maxRotation: 35, autoSkip: true, maxTicksLimit: isLine.value ? 6 : 12 } },
          },
        },
      });
    };
    onMounted(draw);
    watch([nums, names, isLine, color], () => { setTimeout(draw, 0); });   // the canvas appears after the data arrives
    onBeforeUnmount(() => { if (chart) chart.destroy(); });
    return { canvas, hasChartJs, W, H, L, R, B, nums, summary, isLine, color, ticks, pts, every, short, linePath, areaPath };
  },
  template: `
  <div class="chart-box">
    <div class="chart-title">{{ title }}</div>
    <div v-if="!nums.length" class="chart-empty">No data yet</div>
    <div v-else-if="hasChartJs" class="chart-canvas"><canvas ref="canvas" role="img" :aria-label="summary"></canvas></div>
    <svg v-else class="chart-svg" :viewBox="'0 0 ' + W + ' ' + H" role="img" :aria-label="summary">
      <g class="chart-grid">
        <g v-for="t in ticks" :key="t.v">
          <line :x1="L" :x2="W - R" :y1="t.y" :y2="t.y"/>
          <text :x="L - 6" :y="t.y + 4" text-anchor="end">{{ t.v }}</text>
        </g>
      </g>
      <template v-if="isLine">
        <path :d="areaPath" :fill="color" fill-opacity="0.13"/>
        <path :d="linePath" :stroke="color" stroke-width="2.5" fill="none" stroke-linejoin="round"/>
        <circle v-for="(p, i) in pts" :key="i" :cx="p.x" :cy="p.y" :r="pts.length <= 31 ? 3.5 : 0" fill="#fff" :stroke="color" stroke-width="2">
          <title>{{ p.name }}: {{ p.v }}</title>
        </circle>
      </template>
      <template v-else>
        <g v-for="(p, i) in pts" :key="i" class="chart-bar">
          <path :d="'M' + (p.x - Math.min(20, p.slot * 0.36)) + ' ' + (H - B) + 'V' + (p.y + 4) + 'q0 -4 4 -4h' + (Math.min(20, p.slot * 0.36) * 2 - 8) + 'q4 0 4 4V' + (H - B) + 'Z'"
                :fill="color" fill-opacity="0.82"><title>{{ p.name }}: {{ p.v }}</title></path>
          <text class="chart-value" :x="p.x" :y="p.y - 4" text-anchor="middle">{{ p.v }}</text>
        </g>
      </template>
      <text v-for="(p, i) in pts" v-show="i % every === 0" :key="'l' + i" class="chart-label" :x="p.x" :y="H - B + 15" text-anchor="middle">{{ short(p.name) }}</text>
    </svg>
  </div>`,
};
