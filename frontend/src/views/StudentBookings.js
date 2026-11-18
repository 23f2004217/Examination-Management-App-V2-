import { ref, onMounted } from '../vue.js';
import { act, api } from '../api.js';
import { showConfirm } from '../state.js';
import { badgeClass, fmtDate } from '../format.js';

export const StudentBookings = {
  setup() {
    const rows = ref([]);
    const loading = ref(false);

    const load = async () => {
      loading.value = true;
      try { rows.value = await api('GET', '/bookings'); } finally { loading.value = false; }
    };
    onMounted(load);

    const cancel = async (b) => {
      if (await showConfirm('Are you sure you want to cancel this booking for ' + b.exam_name + '? You can re-book another slot if bookings remain open.', { confirmText: 'Cancel booking', cancelText: 'Keep booking' })) {
        if (await act(() => api('POST', `/bookings/${b.id}/cancel`), 'Booking cancelled successfully')) load();
      }
    };

    return { rows, cancel, badgeClass, fmtDate, loading };
  },
  template: `
  <div>
    <PageHeader />

    <LoadingBlock v-if="loading" />

    <div v-else class="card">
      <div class="table-responsive">
        <table class="table table-hover mb-0 align-middle">
          <thead>
            <tr>
              <th>Examination</th>
              <th>Course</th>
              <th>Date</th>
              <th>Time</th>
              <th>Examiner</th>
              <th>Meeting</th>
              <th>Status</th>
              <th class="text-end">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="b in rows" :key="b.id">
              <td class="fw-bold text-dark">{{ b.exam_name }}</td>
              <td><span class="badge-soft badge-soft-dark">{{ b.course }}</span></td>
              <td>{{ fmtDate(b.date) }}</td>
              <td><span class="badge-soft badge-soft-dark">{{ b.start_time }} &ndash; {{ b.end_time }}</span></td>
              <td>{{ b.examiner_name }}</td>
              <td>
                <a v-if="b.meeting_link" :href="b.meeting_link" target="_blank" rel="noopener noreferrer" class="small fw-semibold d-inline-flex align-items-center gap-1 text-primary">
                  <i class="bi bi-camera-video"></i> Join Meeting
                </a>
                <span v-else class="text-muted small">&ndash;</span>
              </td>
              <td><StatusBadge :status="b.status" /></td>
              <td class="text-end">
                <button v-if="b.status === 'Booked'" class="btn btn-sm btn-outline-danger" @click="cancel(b)">
                  <i class="bi bi-x-circle"></i> Cancel
                </button>
              </td>
            </tr>
            <EmptyRow v-if="!rows.length" :colspan="8" icon="bi-calendar-x" text="You have no active or previous examination bookings." />
          </tbody>
        </table>
      </div>
    </div>

  </div>`,
};
