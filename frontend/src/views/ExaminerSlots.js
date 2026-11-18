import { ref, onMounted, computed } from '../vue.js';
import { FormModal } from '../components/Modal.js';
import { act, api } from '../api.js';
import { showConfirm, toast } from '../state.js';
import { badgeClass, fmtDate } from '../format.js';

export const ExaminerSlots = {
  components: { FormModal },
  setup() {
    const slots = ref([]);
    const exams = ref([]);
    const form = ref(null);
    const loading = ref(false);
    const load = async () => {
      loading.value = true;
      try { slots.value = await api('GET', '/slots'); } finally { loading.value = false; }
    };

    onMounted(async () => {
      exams.value = await api('GET', '/exams');
      load();
    });

    const fields = computed(() => [
      { key: 'exam_id', label: 'Examination', type: 'select', required: true, options: exams.value.map((e) => ({ value: e.id, label: `${e.name} (${e.status})` })) },
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'start_time', label: 'Start Time', type: 'time', required: true },
      { key: 'end_time', label: 'End Time', type: 'time', required: true },
      { key: 'capacity', label: 'Capacity', type: 'number', min: 1, required: true },
      { key: 'meeting_link', label: 'Meeting Link (optional)', type: 'url' },
    ]);

    const open = (s) => (form.value = { id: s && s.id, initial: s ? { ...s } : { capacity: 1 } });
    const submit = async (d) => {
      await (form.value.id ? api('PUT', '/slots/' + form.value.id, d) : api('POST', '/slots', d));
      toast('Availability slot saved');
      load();
    };
    const del = async (s) => {
      if (await showConfirm('Remove this slot from the examination schedule?', { confirmText: 'Remove slot', cancelText: 'Keep slot' })) {
        if (await act(() => api('DELETE', '/slots/' + s.id), 'Slot removed')) load();
      }
    };

    return { slots, form, fields, open, submit, del, badgeClass, fmtDate, loading };
  },
  template: `
  <div>
    <PageHeader>
      <button class="btn btn-primary" @click="open()">
        <i class="bi bi-calendar-plus"></i> New Slot
      </button>
    </PageHeader>

    <LoadingBlock v-if="loading" />

    <div v-else class="card">
      <div class="table-responsive">
        <table class="table table-hover mb-0 align-middle">
          <thead>
            <tr>
              <th>Examination</th>
              <th>Date</th>
              <th>Time</th>
              <th>Capacity</th>
              <th>Meeting Link</th>
              <th>Status</th>
              <th class="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in slots" :key="s.id">
              <td class="fw-bold text-dark">{{ s.exam_name }}</td>
              <td>{{ fmtDate(s.date) }}</td>
              <td><span class="badge-soft badge-soft-dark">{{ s.start_time }} &ndash; {{ s.end_time }}</span></td>
              <td><SeatMeter :booked="s.booked" :capacity="s.capacity" /></td>
              <td>
                <a v-if="s.meeting_link" :href="s.meeting_link" target="_blank" rel="noopener noreferrer" class="small d-inline-flex align-items-center gap-1">
                  <i class="bi bi-camera-video"></i> Join Meeting
                </a>
                <span v-else class="text-muted small">&ndash;</span>
              </td>
              <td><StatusBadge :status="s.status" /></td>
              <td class="text-end text-nowrap">
                <button class="btn btn-sm btn-light me-1" :disabled="s.status === 'Cancelled'" @click="open(s)" title="Edit Slot" aria-label="Edit Slot">
                  <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" :disabled="s.status === 'Cancelled'" @click="del(s)" title="Cancel Slot" aria-label="Cancel Slot">
                  <i class="bi bi-x-circle"></i>
                </button>
              </td>
            </tr>
            <EmptyRow v-if="!slots.length" :colspan="7" icon="bi-calendar-plus" text="No slots created yet. Slots can be opened while examinations are in &quot;Slot Creation&quot;." />
          </tbody>
        </table>
      </div>
    </div>

    <FormModal v-if="form" :title="form.id ? 'Edit Slot' : 'New Slot'" :fields="fields" :initial="form.initial" :submit="submit" @close="form = null"/>
  </div>`,
};
