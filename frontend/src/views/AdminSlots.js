import { ref, onMounted, watch, computed } from '../vue.js';
import { FormModal } from '../components/Modal.js';
import { act, api } from '../api.js';
import { showConfirm, toast } from '../state.js';
import { badgeClass, fmtDate } from '../format.js';

export const AdminSlots = {
  components: { FormModal },
  setup() {
    const tab = ref('slots');
    const slots = ref([]);
    const bookings = ref([]);
    const exams = ref([]);
    const examiners = ref([]);
    const q = ref('');
    const examId = ref('');
    const form = ref(null);
    const loading = ref(false);

    const loadSlots = async () => {
      slots.value = await api('GET', '/slots' + (examId.value ? '?exam_id=' + examId.value : ''));
    };
    const loadBookings = async () => {
      bookings.value = await api('GET', '/bookings?q=' + encodeURIComponent(q.value));
    };

    const loadAll = async () => {
      loading.value = true;
      try { await Promise.all([loadSlots(), loadBookings()]); } finally { loading.value = false; }
    };

    onMounted(async () => {
      exams.value = await api('GET', '/exams');
      examiners.value = await api('GET', '/examiners');
      loadAll();
    });

    watch(examId, loadSlots);
    watch(q, loadBookings);

    const examExaminers = (s) => exams.value.find((e) => e.id === s.exam_id)?.examiners || [];
    const reassign = async (s, id) => {
      if (id && (await act(() => api('PUT', `/slots/${s.id}/examiner`, { examiner_id: +id }), 'Examiner reassigned'))) loadAll();
    };
    const cancel = async (s) => {
      if (await showConfirm('Cancel this slot? Any booked students will have their appointments invalidated.', { confirmText: 'Cancel slot', cancelText: 'Keep slot' })) {
        if (await act(() => api('DELETE', '/slots/' + s.id), 'Slot cancelled')) loadAll();
      }
    };

    const fields = [
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'start_time', label: 'Start Time', type: 'time', required: true },
      { key: 'end_time', label: 'End Time', type: 'time', required: true },
      { key: 'capacity', label: 'Capacity', type: 'number', min: 1, required: true },
      { key: 'meeting_link', label: 'Meeting Link (optional)', type: 'url' },
    ];

    const newFields = computed(() => [
      { key: 'exam_id', label: 'Examination', type: 'select', required: true, options: exams.value.map((e) => ({ value: e.id, label: e.name })) },
      { key: 'examiner_id', label: 'Examiner', type: 'select', required: true, options: examiners.value.filter((x) => x.status === 'Active').map((x) => ({ value: x.id, label: x.name })) },
      ...fields,
    ]);

    const open = (s) => (form.value = s ? { id: s.id, initial: { ...s } } : { initial: { capacity: 1 } });
    const submit = async (d) => {
      await (form.value.id ? api('PUT', '/slots/' + form.value.id, d) : api('POST', '/slots', d));
      toast(form.value.id ? 'Slot rescheduled successfully' : 'Slot created successfully');
      loadAll();
    };

    const targets = (b) => slots.value.filter((s) => s.exam_id === b.exam_id && s.id !== b.slot_id && s.status === 'Available');
    const move = async (b, id) => {
      if (id && (await act(() => api('PUT', `/bookings/${b.id}/reschedule`, { slot_id: +id }), 'Booking rescheduled'))) loadAll();
    };

    return {
      tab, slots, bookings, exams, q, examId, form, examExaminers,
      reassign, cancel, fields, newFields, open, submit, targets, move,
      badgeClass, fmtDate, loading,
    };
  },
  template: `
  <div>
    <PageHeader>
      <button class="btn btn-primary" @click="open()">
        <i class="bi bi-calendar-plus"></i> New Slot
      </button>
    </PageHeader>

    <ul class="nav nav-pills mb-3 bg-white p-1 rounded-3 border d-inline-flex">
      <li class="nav-item">
        <a class="nav-link" :class="{ active: tab === 'slots' }" href="#" @click.prevent="tab = 'slots'">
          <i class="bi bi-calendar3 me-1"></i> Examination Slots ({{ slots.length }})
        </a>
      </li>
      <li class="nav-item">
        <a class="nav-link" :class="{ active: tab === 'bookings' }" href="#" @click.prevent="tab = 'bookings'">
          <i class="bi bi-ticket-detailed me-1"></i> Student Bookings ({{ bookings.length }})
        </a>
      </li>
    </ul>

    <LoadingBlock v-if="loading" />

    <div v-else>
      <!-- Slots Tab -->
      <div v-if="tab === 'slots'">
        <FilterBar>
          <select class="form-select" v-model="examId" aria-label="Filter by examination">
            <option value="">All examinations</option>
            <option v-for="e in exams" :key="e.id" :value="e.id">{{ e.name }}</option>
          </select>
        </FilterBar>

        <div class="card">
          <div class="table-responsive">
            <table class="table table-hover mb-0 align-middle">
              <thead>
                <tr>
                  <th>Examination</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Examiners</th>
                  <th>Seats</th>
                  <th>Status</th>
                  <th class="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="s in slots" :key="s.id">
                  <td class="fw-bold text-dark">{{ s.exam_name }}</td>
                  <td>{{ fmtDate(s.date) }}</td>
                  <td><span class="badge-soft badge-soft-dark">{{ s.start_time }} &ndash; {{ s.end_time }}</span></td>
                  <td>
                    <select class="form-select form-select-sm" :value="s.examiner_id" @change="reassign(s, $event.target.value)">
                      <option v-for="x in examExaminers(s)" :key="x.id" :value="x.id">{{ x.name }}</option>
                    </select>
                  </td>
                  <td>
                    <SeatMeter :booked="s.booked" :capacity="s.capacity" />
                  </td>
                  <td><StatusBadge :status="s.status" /></td>
                  <td class="text-end text-nowrap">
                    <button class="btn btn-sm btn-light me-1" @click="open(s)" title="Reschedule Slot" aria-label="Reschedule Slot">
                      <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" :disabled="s.status === 'Cancelled'" @click="cancel(s)" title="Cancel Slot" aria-label="Cancel Slot">
                      <i class="bi bi-x-circle"></i>
                    </button>
                  </td>
                </tr>
                <EmptyRow v-if="!slots.length" :colspan="7" icon="bi-calendar-x" text="No examination slots found." />
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Bookings Tab -->
      <div v-else>
        <FilterBar v-model="q" placeholder="Search bookings by student, email, examination or booking ID" />

        <div class="card">
          <div class="table-responsive">
            <table class="table table-hover mb-0 align-middle">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Student</th>
                  <th>Exam Title</th>
                  <th>Slot Schedule</th>
                  <th>Examiner</th>
                  <th>Status</th>
                  <th>Marks</th>
                  <th>Move to Slot</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="b in bookings" :key="b.id">
                  <td><span class="badge-soft badge-soft-dark">#{{ b.id }}</span></td>
                  <td class="fw-bold text-dark">{{ b.student_name }}</td>
                  <td>{{ b.exam_name }}</td>
                  <td>{{ fmtDate(b.date) }} {{ b.start_time }}</td>
                  <td>{{ b.examiner_name }}</td>
                  <td><StatusBadge :status="b.status" /></td>
                  <td>
                    <span v-if="b.evaluation" class="fw-bold text-success">{{ b.evaluation.total_marks }} / {{ b.max_marks }}</span>
                    <span v-else class="text-muted small">&ndash;</span>
                  </td>
                  <td>
                    <select v-if="b.status === 'Booked'" class="form-select form-select-sm" @change="move(b, $event.target.value); $event.target.value = ''">
                      <option value="">Move to another slot...</option>
                      <option v-for="s in targets(b)" :key="s.id" :value="s.id">
                        {{ fmtDate(s.date) }} {{ s.start_time }} &middot; {{ s.examiner_name }} ({{ s.available_seats }} seats free)
                      </option>
                    </select>
                  </td>
                </tr>
                <EmptyRow v-if="!bookings.length" :colspan="8" icon="bi-ticket" text="No bookings match the search criteria." />
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <FormModal v-if="form" :title="form.id ? 'Reschedule Slot' : 'New Slot'" :fields="form.id ? fields : newFields" :initial="form.initial" :submit="submit" @close="form = null"/>
  </div>`,
};
