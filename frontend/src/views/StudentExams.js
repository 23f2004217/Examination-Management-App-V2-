import { reactive, ref, onMounted, watch } from '../vue.js';
import { Modal } from '../components/Modal.js';
import { act, api } from '../api.js';
import { badgeClass, cardColor, fmtDate } from '../format.js';

export const StudentExams = {
  components: { Modal },
  setup() {
    const rows = ref([]);
    const view = ref(null);
    const filt = reactive({ q: '', type: '', status: '' });
    const types = ['Viva', 'Practical', 'Project Demo', 'Assessment'];
    const loading = ref(false);

    const load = async () => {
      loading.value = true;
      try {
        const qs = new URLSearchParams(Object.entries(filt).filter(([, v]) => v)).toString();
        rows.value = await api('GET', '/exams?' + qs);
      } finally {
        loading.value = false;
      }
    };
    onMounted(load);
    watch(filt, load);

    const openSlots = async (e) => {
      view.value = {
        exam: e,
        slots: await api('GET', '/slots?exam_id=' + e.id),
        rubrics: await api('GET', `/exams/${e.id}/rubrics`),
      };
    };

    const book = async (s) => {
      if (await act(() => api('POST', '/bookings', { slot_id: s.id }), 'Slot booked successfully')) {
        view.value.slots = await api('GET', '/slots?exam_id=' + s.exam_id);
      }
    };

    return { rows, view, filt, types, openSlots, book, badgeClass, cardColor, fmtDate, loading };
  },
  template: `
  <div>
    <PageHeader />

    <FilterBar v-model="filt.q" placeholder="Search examinations by name or course">
      <select class="form-select" v-model="filt.type" aria-label="Filter by type">
        <option value="">All types</option>
        <option v-for="t in types" :key="t">{{ t }}</option>
      </select>
      <select class="form-select" v-model="filt.status" aria-label="Filter by status">
        <option value="">All statuses</option>
        <option>Slot Creation</option>
        <option>Booking Open</option>
        <option>Closed</option>
        <option>Completed</option>
      </select>
    </FilterBar>

    <LoadingBlock v-if="loading" />

    <!-- Exam Cards Grid -->
    <div v-else class="row g-3">
      <div class="col-md-6 col-lg-4" v-for="e in rows" :key="e.id">
        <div class="card exam-card h-100">
          <div class="head" :style="{ background: cardColor(e.id) }">
            <span class="chip">{{ e.status }}</span>
            <div class="t">{{ e.name }}</div>
            <div class="s">{{ e.course_code }} &middot; {{ e.course_name }}</div>
          </div>
          <div class="body d-flex flex-column justify-content-between">
            <div class="mb-3">
              <div class="d-flex align-items-center gap-3 small text-muted mb-2">
                <span><i class="bi bi-tag me-1"></i>{{ e.type }}</span>
                <span><i class="bi bi-clock me-1"></i>{{ e.duration }}m</span>
                <span><i class="bi bi-award me-1"></i>{{ e.max_marks }} marks</span>
              </div>
              <div class="small text-secondary mb-2">
                <i class="bi bi-calendar-range me-1"></i>Booking Window: <b>{{ fmtDate(e.booking_start) }}</b> &ndash; <b>{{ fmtDate(e.booking_end) }}</b>
              </div>
              <p class="small text-muted mb-0" style="min-height: 38px;">{{ e.instructions || 'No specific instructions posted.' }}</p>
            </div>
            <button class="btn btn-sm w-100" :class="e.status === 'Booking Open' ? 'btn-primary' : 'btn-outline-secondary'" @click="openSlots(e)">
              <i class="bi bi-calendar3 me-1"></i>
              {{ e.status === 'Booking Open' ? 'View Slots & Book' : 'View Details' }}
            </button>
          </div>
        </div>
      </div>
      <div v-if="!rows.length" class="col-12 empty-state">
        <div class="empty-icon"><i class="bi bi-journal-x"></i></div>
        <div>No examinations found matching your search.</div>
      </div>
    </div>

    <!-- Slots & Rubric Inspection Modal -->
    <Modal v-if="view" :title="view.exam.name" icon="bi-journal-bookmark" wide @close="view = null">
      <!-- Rubric section -->
      <div class="mb-4">
        <h6 class="fw-bold d-flex align-items-center gap-2 mb-2">
          <i class="bi bi-card-checklist text-primary"></i> Evaluation Rubrics &amp; Criteria
        </h6>
        <div class="table-responsive border rounded">
          <table class="table table-sm mb-0">
            <thead class="bg-light">
              <tr>
                <th>Criterion</th>
                <th>Max Marks</th>
                <th>Weightage</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in view.rubrics" :key="r.id">
                <td class="fw-semibold">{{ r.criterion }}</td>
                <td>{{ r.max_marks }} marks</td>
                <td>{{ r.weightage }}x</td>
                <td class="small text-muted">{{ r.description || '-' }}</td>
              </tr>
              <EmptyRow v-if="!view.rubrics.length" :colspan="4" compact text="Rubrics have not been published for this examination yet." />
            </tbody>
          </table>
        </div>
      </div>

      <!-- Slots section -->
      <div>
        <h6 class="fw-bold d-flex align-items-center gap-2 mb-2">
          <i class="bi bi-calendar-event text-primary"></i> Available Appointment Slots
        </h6>
        <div class="table-responsive border rounded">
          <table class="table table-hover table-sm mb-0 align-middle">
            <thead class="bg-light">
              <tr>
                <th>Date</th>
                <th>Time</th>
                <th>Examiner</th>
                <th>Seats Available</th>
                <th class="text-end">Reservation</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in view.slots" :key="s.id">
                <td class="fw-semibold">{{ fmtDate(s.date) }}</td>
                <td><span class="badge-soft badge-soft-dark">{{ s.start_time }} &ndash; {{ s.end_time }}</span></td>
                <td>{{ s.examiner_name }}</td>
                <td>
                  <span class="badge-soft" :class="s.available_seats > 0 ? 'badge-soft-success' : 'badge-soft-danger'">
                    {{ s.available_seats }} / {{ s.capacity }} seats left
                  </span>
                </td>
                <td class="text-end">
                  <button class="btn btn-sm btn-primary" :disabled="view.exam.status !== 'Booking Open' || s.available_seats <= 0 || s.status !== 'Available'" @click="book(s)">
                    <i class="bi bi-bookmark-check"></i>
                    {{ s.available_seats <= 0 ? 'Full' : 'Book This Slot' }}
                  </button>
                </td>
              </tr>
              <EmptyRow v-if="!view.slots.length" :colspan="5" compact text="No availability slots opened by examiners yet." />
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  </div>`,
};
