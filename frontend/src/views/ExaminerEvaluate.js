import { ref, onMounted, computed } from '../vue.js';
import { Modal } from '../components/Modal.js';
import { act, api } from '../api.js';
import { badgeClass, fmtDate } from '../format.js';

export const ExaminerEvaluate = {
  components: { Modal },
  setup() {
    const slots = ref([]);
    const view = ref(null);
    const ev = ref(null);
    const loading = ref(false);

    const load = async () => {
      loading.value = true;
      try { slots.value = await api('GET', '/slots'); } finally { loading.value = false; }
    };
    onMounted(load);

    const open = async (s) => {
      view.value = { slot: s, list: await api('GET', `/slots/${s.id}/bookings`) };
    };

    const startEval = async (b) => {
      const rubrics = await api('GET', `/exams/${b.exam_id}/rubrics`);
      const prev = {};
      (b.evaluation?.scores || []).forEach((s) => (prev[s.rubric_id] = s.marks));
      ev.value = {
        b,
        rubrics,
        marks: Object.fromEntries(rubrics.map((r) => [r.id, prev[r.id] ?? ''])),
        remarks: b.evaluation?.remarks || '',
      };
    };

    // Real-time dynamic weighted score calculation for instantaneous UX feedback!
    const liveScore = computed(() => {
      if (!ev.value || !ev.value.rubrics.length) return null;
      let weighted = 0;
      let wsum = 0;
      for (const r of ev.value.rubrics) {
        const m = parseFloat(ev.value.marks[r.id]);
        if (!isNaN(m)) {
          weighted += (m / r.max_marks) * r.weightage;
          wsum += r.weightage;
        }
      }
      if (wsum === 0) return 0;
      const total = Math.round(((weighted / wsum) * ev.value.b.max_marks) * 100) / 100;
      return total;
    });

    const save = async () => {
      const body = {
        scores: Object.entries(ev.value.marks).map(([rubric_id, marks]) => ({ rubric_id: +rubric_id, marks: parseFloat(marks) || 0 })),
        remarks: ev.value.remarks,
      };
      if (await act(() => api('POST', `/bookings/${ev.value.b.id}/evaluate`, body), 'Evaluation saved')) {
        ev.value = null;
        await open(view.value.slot);
        load();
      }
    };

    const complete = async (s) => {
      if (await act(() => api('POST', `/slots/${s.id}/complete`), 'Slot marked as completed')) {
        view.value = null;
        load();
      }
    };

    return { slots, view, ev, liveScore, open, startEval, save, complete, badgeClass, fmtDate, loading };
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
              <th>Date</th>
              <th>Time</th>
              <th>Booked Students</th>
              <th>Status</th>
              <th class="text-end">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in slots.filter(x => x.status !== 'Cancelled')" :key="s.id">
              <td class="fw-bold text-dark">{{ s.exam_name }}</td>
              <td>{{ fmtDate(s.date) }}</td>
              <td><span class="badge-soft badge-soft-dark">{{ s.start_time }} &ndash; {{ s.end_time }}</span></td>
              <td><span class="badge-soft badge-soft-primary">{{ s.booked }} student(s)</span></td>
              <td><StatusBadge :status="s.status" /></td>
              <td class="text-end">
                <button class="btn btn-sm btn-primary" @click="open(s)">
                  <i class="bi bi-people-fill"></i> View Students
                </button>
              </td>
            </tr>
            <EmptyRow v-if="!slots.length" :colspan="6" icon="bi-check2-circle" text="No evaluation slots available." />
          </tbody>
        </table>
      </div>
    </div>

    <!-- Slot roster modal -->
    <Modal v-if="view" :title="view.slot.exam_name + ' &middot; ' + fmtDate(view.slot.date)" icon="bi-people" wide @close="view = null">
      <div class="table-responsive mb-3">
        <table class="table table-hover align-middle">
          <thead>
            <tr>
              <th>Student</th>
              <th>Status</th>
              <th>Marks</th>
              <th class="text-end">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="b in view.list" :key="b.id">
              <td class="fw-bold text-dark">{{ b.student_name }}</td>
              <td><StatusBadge :status="b.status" /></td>
              <td>
                <span v-if="b.evaluation" class="fw-bold text-success">{{ b.evaluation.total_marks }} / {{ b.max_marks }}</span>
                <span v-else class="badge-soft badge-soft-warning"><i class="bi bi-hourglass me-1"></i>Pending</span>
              </td>
              <td class="text-end">
                <button class="btn btn-sm btn-primary" :disabled="b.results_published" @click="startEval(b)">
                  <i class="bi bi-pencil-square"></i> {{ b.evaluated ? 'Re-evaluate' : 'Evaluate' }}
                </button>
              </td>
            </tr>
            <EmptyRow v-if="!view.list.length" :colspan="4" compact text="No students booked for this slot." />
          </tbody>
        </table>
      </div>

      <div class="d-flex justify-content-between align-items-center pt-2 border-top">
        <span class="small text-muted">Complete the slot once all students in this session have been scored.</span>
        <button class="btn btn-success" @click="complete(view.slot)">
          <i class="bi bi-check-all"></i> Mark Slot Completed
        </button>
      </div>
    </Modal>

    <!-- Rubric Scoring Modal with Real-time Calculation -->
    <Modal v-if="ev" :title="'Evaluate: ' + ev.b.student_name" icon="bi-award" @close="ev = null">
      <div class="panel-inset mb-3 d-flex justify-content-between align-items-center">
        <div>
          <div class="small text-muted">Total Calculated Score</div>
          <div class="fs-4 fw-bold text-primary">{{ liveScore ?? 0 }} / {{ ev.b.max_marks }}</div>
        </div>
        <span class="badge-soft badge-soft-primary">Live Weighted Calculation</span>
      </div>

      <form @submit.prevent="save">
        <div class="mb-3 panel-inset" v-for="r in ev.rubrics" :key="r.id">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <label class="form-label fw-bold mb-0">{{ r.criterion }}</label>
            <span class="badge-soft badge-soft-dark">Max: {{ r.max_marks }} (Weight: {{ r.weightage }}x)</span>
          </div>
          <div class="text-muted small mb-2" v-if="r.description">{{ r.description }}</div>
          <div class="input-group">
            <span class="input-group-text bg-light text-muted">Marks</span>
            <input type="number" class="form-control" v-model="ev.marks[r.id]" min="0" :max="r.max_marks" step="0.5" placeholder="Enter score" required>
            <span class="input-group-text bg-light text-muted">/ {{ r.max_marks }}</span>
          </div>
        </div>

        <div class="mb-3">
          <label class="form-label small fw-semibold text-muted">Examiner Remarks &amp; Feedback</label>
          <textarea class="form-control" rows="3" v-model="ev.remarks" placeholder="Provide constructive feedback for the student's performance..."></textarea>
        </div>

        <p v-if="!ev.rubrics.length" class="text-danger small">No rubric defined for this examination.</p>

        <div class="d-flex justify-content-end gap-2">
          <button type="button" class="btn btn-light" @click="ev = null">Cancel</button>
          <button class="btn btn-primary" :disabled="!ev.rubrics.length">
            <i class="bi bi-check2"></i> Submit Final Score
          </button>
        </div>
      </form>
    </Modal>
  </div>`,
};
