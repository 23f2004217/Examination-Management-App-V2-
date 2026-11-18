import { ref, onMounted, onBeforeUnmount, computed } from '../vue.js';
import { act, api } from '../api.js';
import { firstNameOf, state, toast, token } from '../state.js';
import { cardColor, fmtDate, fmtDay } from '../format.js';

export const StudentDash = {
  setup() {
    const d = ref(null);
    const job = ref(null);
    const loading = ref(false);

    const load = async () => {
      loading.value = true;
      try { d.value = await api('GET', '/dashboard'); } finally { loading.value = false; }
    };
    onMounted(load);

    let pollTimer = null;
    onBeforeUnmount(() => { if (pollTimer) clearInterval(pollTimer); });

    const exportCsv = async () => {
      const j = await act(() => api('POST', '/export/history'), 'Export background task queued. Preparing CSV...');
      if (!j) return;
      job.value = j;
      let tries = 0;
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(async () => {
        if (++tries > 60) { clearInterval(pollTimer); pollTimer = null; toast('Export is taking long. Check back later.', 'danger'); return; }
        try {
          const s = await api('GET', '/export/' + j.id);
          if (s.status !== 'Pending') {
            clearInterval(pollTimer);
            pollTimer = null;
            job.value = s;
            toast(s.status === 'Done' ? 'Your CSV export is ready to download' : 'Export failed', s.status === 'Done' ? 'success' : 'danger');
          }
        } catch (e) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
      }, 1500);
    };

    const downloadCsv = async () => {
      const r = await fetch(`/api/export/${job.value.id}/download`, { headers: { Authorization: 'Bearer ' + token() } });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(await r.blob());
      a.download = 'examination_history.csv';
      a.click();
    };

    return {
      d, job, exportCsv, downloadCsv, cardColor, fmtDay, fmtDate,
      user: computed(() => state.user || {}), loading,
      firstName: computed(() => firstNameOf(state.user && state.user.name)),
    };
  },
  template: `
  <div>
    <LoadingBlock v-if="loading" />

    <div v-else-if="d">
      <HeroBanner :title="'Hello, ' + firstName + ' 👋'"
                :subtitle="d.upcoming.length ? 'You have ' + d.upcoming.length + ' upcoming examination' + (d.upcoming.length > 1 ? 's' : '') + '. Check your slot details below.' : 'No upcoming examinations. Browse open examinations to book a slot.'">
        <button class="btn btn-light" :disabled="job && job.status === 'Pending'" @click="exportCsv">
          <i class="bi bi-file-earmark-spreadsheet text-success"></i>
          {{ job && job.status === 'Pending' ? 'Generating CSV...' : 'Export History (CSV)' }}
        </button>
        <button v-if="job && job.status === 'Done'" class="btn btn-success" @click="downloadCsv">
          <i class="bi bi-download"></i> Download File
        </button>
      </HeroBanner>

      <!-- Stat Tiles -->
      <div class="row g-3 mb-4">
        <div class="col-6 col-md-3">
          <StatCard tone="primary" icon="bi-journal-text" label="Open Exams" :value="d.available_exams.length" />
        </div>
        <div class="col-6 col-md-3">
          <StatCard tone="info" icon="bi-calendar3" label="Available Slots" :value="d.available_slots" />
        </div>
        <div class="col-6 col-md-3">
          <StatCard tone="warning" icon="bi-clock-history" label="Booked Sessions" :value="d.booked" />
        </div>
        <div class="col-6 col-md-3">
          <StatCard tone="success" icon="bi-trophy" label="Published Results" :value="d.results.length" />
        </div>
      </div>

      <!-- Main Columns: Available Exams vs Upcoming Agenda -->
      <div class="row g-4">
        <div class="col-lg-8">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h2 class="section-title">Open for Booking</h2>
            <router-link to="/student/exams" class="small fw-semibold">View all &rarr;</router-link>
          </div>

          <div class="row g-3 mb-4">
            <div class="col-md-6" v-for="e in d.available_exams" :key="e.id">
              <div class="card exam-card h-100">
                <div class="head" :style="{ background: cardColor(e.id) }">
                  <span class="chip">{{ e.type }}</span>
                  <div class="t">{{ e.name }}</div>
                  <div class="s">{{ e.course_code }} &middot; {{ e.course_name }}</div>
                </div>
                <div class="body d-flex justify-content-between align-items-center">
                  <div class="small text-muted">
                    <i class="bi bi-calendar-event me-1"></i>Book by {{ fmtDate(e.booking_end) }}
                  </div>
                  <router-link class="btn btn-sm btn-primary" to="/student/exams">
                    Book Slot
                  </router-link>
                </div>
              </div>
            </div>
            <div v-if="!d.available_exams.length" class="col-12">
              <div class="card empty-state compact">
                <div class="empty-icon"><i class="bi bi-journal-x"></i></div>
                <div>No examinations are open for booking right now.</div>
              </div>
            </div>
          </div>

          <!-- Published Results -->
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h2 class="section-title">Recent Results</h2>
            <router-link to="/student/results" class="small fw-semibold">Scorecards &rarr;</router-link>
          </div>
          <div class="card">
            <ul class="list-group list-group-flush">
              <li class="list-group-item d-flex justify-content-between align-items-center py-3" v-for="b in d.results" :key="b.id">
                <div>
                  <div class="fw-semibold text-dark">{{ b.exam_name }}</div>
                  <div class="small text-muted">{{ b.course }} &middot; Examiner: {{ b.examiner_name }}</div>
                </div>
                <div class="text-end">
                  <div class="fs-5 fw-bold text-success">{{ b.evaluation.total_marks }} / {{ b.max_marks }}</div>
                  <router-link to="/student/results" class="small">View Scorecard</router-link>
                </div>
              </li>
              <li v-if="!d.results.length" class="list-group-item empty-state compact">No results published yet.</li>
            </ul>
          </div>
        </div>

        <!-- Right Column: Agenda / To Do -->
        <div class="col-lg-4">
          <div class="card">
            <div class="card-body">
              <h2 class="section-title mb-3 d-flex align-items-center gap-2">
                <i class="bi bi-calendar-check text-primary"></i> Upcoming Schedule
              </h2>
              <div class="todo-item" v-for="b in d.upcoming" :key="b.id">
                <div class="todo-date">
                  <b>{{ fmtDay(b.date).d }}</b>
                  <small>{{ fmtDay(b.date).m }}</small>
                </div>
                <div class="flex-grow-1">
                  <div class="fw-semibold text-dark">{{ b.exam_name }}</div>
                  <div class="small text-muted">{{ b.start_time }} &ndash; {{ b.end_time }} &middot; {{ b.examiner_name }}</div>
                  <a v-if="b.meeting_link" :href="b.meeting_link" target="_blank" rel="noopener noreferrer" class="small text-primary fw-semibold d-inline-flex align-items-center gap-1 mt-1">
                    <i class="bi bi-camera-video"></i> Join Meeting
                  </a>
                </div>
              </div>
              <div v-if="!d.upcoming.length" class="empty-state compact">
                <div class="empty-icon"><i class="bi bi-cup-hot"></i></div>
                <div>No upcoming examinations.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`,
};
