import { ref, onMounted, computed } from '../vue.js';
import { ChartBox } from '../components/ChartBox.js';
import { act, api } from '../api.js';
import { firstNameOf, state, token } from '../state.js';

export const AdminDash = {
  components: { ChartBox },
  setup() {
    const s = ref({});
    const c = ref({ popular: [], workload: [], trend: [] });
    const rep = ref(null);
    const loading = ref(false);

    onMounted(async () => {
      loading.value = true;
      try {
        s.value = await api('GET', '/dashboard');
        c.value = await api('GET', '/admin/charts');
        rep.value = await api('GET', '/admin/report');
      } finally {
        loading.value = false;
      }
    });

    const sendReport = () => act(() => api('POST', '/admin/report/send'), 'Report email sent to admin.');
    const downloadPdf = async () => {
      const r = await fetch('/api/admin/report/pdf', { headers: { Authorization: 'Bearer ' + token() } });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(await r.blob());
      a.download = 'examination_report.pdf';
      a.click();
    };

    const tiles = computed(() => [
      { label: 'Courses', val: s.value.courses, icon: 'bi-book-half', tone: 'indigo' },
      { label: 'Examinations', val: s.value.exams, icon: 'bi-journal-check', tone: 'blue' },
      { label: 'Students', val: s.value.students, icon: 'bi-mortarboard', tone: 'teal' },
      { label: 'Examiners', val: s.value.examiners, icon: 'bi-person-badge', tone: 'violet' },
      { label: 'Total Slots', val: s.value.slots, icon: 'bi-calendar3', tone: 'amber' },
      { label: 'Bookings', val: s.value.bookings, icon: 'bi-ticket-detailed', tone: 'rose' },
    ]);
    const firstName = computed(() => firstNameOf(state.user && state.user.name));

    return { tiles, c, rep, sendReport, downloadPdf, loading, firstName };
  },
  template: `
  <div>
    <HeroBanner :title="'Hello, ' + firstName + ' 👋'" subtitle="Monitor examinations, examiner workload and scheduling at a glance.">
      <template v-if="rep">
        <button class="btn btn-light" @click="downloadPdf"><i class="bi bi-file-earmark-pdf"></i> Download PDF</button>
        <button class="btn btn-light" @click="sendReport"><i class="bi bi-envelope"></i> Email Report</button>
      </template>
    </HeroBanner>

    <LoadingBlock v-if="loading" />

    <div v-else>
      <!-- Stat Tiles -->
      <div class="row g-3 mb-4">
        <div class="col-6 col-md-4 col-lg-2" v-for="t in tiles" :key="t.label">
          <StatCard :label="t.label" :value="t.val" :icon="t.icon" :tone="t.tone" />
        </div>
      </div>

      <!-- Charts Section -->
      <div class="row g-3 mb-4">
        <div class="col-md-4">
          <div class="card p-3 h-100">
            <ChartBox type="bar" :labels="c.popular.map(x => x.label)" :values="c.popular.map(x => x.value)"
                      title="Most Popular Examinations" accentColor="#4f46e5" />
          </div>
        </div>
        <div class="col-md-4">
          <div class="card p-3 h-100">
            <ChartBox type="bar" :labels="c.workload.map(x => x.label)" :values="c.workload.map(x => x.value)"
                      title="Examiner Evaluation Workload" accentColor="#0d9488" />
          </div>
        </div>
        <div class="col-md-4">
          <div class="card p-3 h-100">
            <ChartBox type="line" :labels="c.trend.map(x => x.label)" :values="c.trend.map(x => x.value)"
                      title="30-Day Booking Trends" accentColor="#2563eb" />
          </div>
        </div>
      </div>

      <!-- Monthly Report Summary Card -->
      <div class="card" v-if="rep">
        <div class="card-body p-4">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <div class="d-flex align-items-center gap-2">
              <i class="bi bi-file-text-fill text-primary fs-4"></i>
              <h5 class="fw-bold mb-0">Monthly Report &middot; {{ rep.month }}</h5>
            </div>
            <span class="badge-soft badge-soft-primary">Official Academic Audit</span>
          </div>

          <div class="row g-3">
            <div class="col-md-3">
              <div class="panel-inset">
                <div class="text-muted small">Exams Conducted</div>
                <div class="fs-4 fw-bold text-dark">{{ rep.examinations_conducted }}</div>
              </div>
            </div>
            <div class="col-md-3">
              <div class="panel-inset">
                <div class="text-muted small">Students Evaluated</div>
                <div class="fs-4 fw-bold text-dark">{{ rep.students_evaluated }}</div>
              </div>
            </div>
            <div class="col-md-3">
              <div class="panel-inset">
                <div class="text-muted small">Completed Bookings</div>
                <div class="fs-4 fw-bold text-dark">{{ rep.completed_bookings }}</div>
              </div>
            </div>
            <div class="col-md-3">
              <div class="panel-inset">
                <div class="text-muted small">Pending Evaluations</div>
                <div class="fs-4 fw-bold" :class="rep.pending_evaluations ? 'text-danger' : 'text-success'">
                  {{ rep.pending_evaluations }}
                </div>
              </div>
            </div>
          </div>

          <div class="mt-3 pt-3 border-top small text-muted">
            <b>Most Active Examiners:</b>
            <span class="ms-1">{{ rep.active_examiners.map(e => e.name + ' (' + e.evaluations + ' evaluations)').join(' &middot; ') || 'No evaluations recorded this month.' }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>`,
};
