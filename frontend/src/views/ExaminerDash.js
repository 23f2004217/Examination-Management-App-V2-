import { ref, onMounted, computed } from '../vue.js';
import { act, api } from '../api.js';
import { firstNameOf, state } from '../state.js';
import { badgeClass, fmtDate } from '../format.js';

export const ExaminerDash = {
  setup() {
    const d = ref(null);
    const loading = ref(false);

    const load = async () => {
      loading.value = true;
      try { d.value = await api('GET', '/dashboard'); } finally { loading.value = false; }
    };
    onMounted(load);

    const setStatus = async (e, status) => {
      await act(() => api('POST', `/exams/${e.id}/status`, { status }), 'Examination marked ' + status.toLowerCase());
      load();
    };

    const firstName = computed(() => firstNameOf(state.user && state.user.name));
    return { d, setStatus, badgeClass, fmtDate, loading, firstName };
  },
  template: `
  <div>
    <HeroBanner :title="'Hello, ' + firstName + ' 👋'" subtitle="Manage your slots, evaluate students against rubrics and close out examinations." />

    <LoadingBlock v-if="loading" />

    <div v-else-if="d">
      <!-- Stat Tiles -->
      <div class="row g-3 mb-4">
        <div class="col-md-4">
          <StatCard tone="info" icon="bi-calendar-check" label="My Created Slots" :value="d.slots" />
        </div>
        <div class="col-md-4">
          <StatCard tone="primary" icon="bi-people" label="Booked Students" :value="d.booked_students" />
        </div>
        <div class="col-md-4">
          <StatCard tone="warning" icon="bi-hourglass-split" label="Pending Evaluations" :value="d.pending_evaluations" />
        </div>
      </div>

      <!-- Assigned Exams -->
      <div class="card mb-4">
        <div class="card-title-bar">
          <span><i class="bi bi-journal-text"></i>Assigned Examinations</span>
          <router-link to="/examiner/slots" class="btn btn-sm btn-outline-primary">
            <i class="bi bi-calendar-plus"></i> Open Slots
          </router-link>
        </div>
        <div class="table-responsive">
          <table class="table table-hover mb-0 align-middle">
            <thead>
              <tr>
                <th>Title</th>
                <th>Course</th>
                <th>Type</th>
                <th>Status</th>
                <th class="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="e in d.assigned_exams" :key="e.id">
                <td class="fw-bold text-dark">{{ e.name }}</td>
                <td><span class="badge-soft badge-soft-dark">{{ e.course_code }}</span></td>
                <td>{{ e.type }}</td>
                <td><StatusBadge :status="e.status" /></td>
                <td class="text-end text-nowrap">
                  <button class="btn btn-sm btn-outline-secondary me-1" :disabled="!e.next_statuses.includes('Closed')" @click="setStatus(e, 'Closed')">
                    <i class="bi bi-door-closed"></i> Close
                  </button>
                  <button class="btn btn-sm btn-outline-success" :disabled="!e.next_statuses.includes('Completed')" :title="e.status === 'Closed' ? '' : 'Close the examination first'" @click="setStatus(e, 'Completed')">
                    <i class="bi bi-check2-all"></i> Mark Completed
                  </button>
                </td>
              </tr>
              <EmptyRow v-if="!d.assigned_exams.length" :colspan="5" icon="bi-inbox" text="No examinations currently assigned to your profile." />
            </tbody>
          </table>
        </div>
      </div>

      <!-- Created Slots -->
      <div class="card">
        <div class="card-title-bar">
          <span><i class="bi bi-clock-history"></i>Recent Availability Slots</span>
          <router-link to="/examiner/evaluate" class="btn btn-sm btn-primary">
            <i class="bi bi-check2-square"></i> Go to Evaluations
          </router-link>
        </div>
        <div class="table-responsive">
          <table class="table table-hover mb-0 align-middle">
            <thead>
              <tr>
                <th>Examination</th>
                <th>Date</th>
                <th>Time</th>
                <th>Capacity</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in d.slot_list" :key="s.id">
                <td class="fw-bold text-dark">{{ s.exam_name }}</td>
                <td>{{ fmtDate(s.date) }}</td>
                <td><span class="badge-soft badge-soft-dark">{{ s.start_time }} &ndash; {{ s.end_time }}</span></td>
                <td><SeatMeter :booked="s.booked" :capacity="s.capacity" /></td>
                <td><StatusBadge :status="s.status" /></td>
              </tr>
              <EmptyRow v-if="!d.slot_list.length" :colspan="5" icon="bi-calendar-x" text="No examination slots created yet." />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>`,
};
