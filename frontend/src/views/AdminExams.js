import { reactive, ref, onMounted, watch, computed } from '../vue.js';
import { FormModal, Modal } from '../components/Modal.js';
import { act, api } from '../api.js';
import { showConfirm, toast } from '../state.js';
import { badgeClass } from '../format.js';

export const AdminExams = {
  components: { FormModal, Modal },
  setup() {
    const rows = ref([]);
    const courses = ref([]);
    const examiners = ref([]);
    const form = ref(null);
    const rub = ref(null);
    const asg = ref(null);
    const filt = reactive({ q: '', type: '', status: '' });
    const types = ['Viva', 'Practical', 'Project Demo', 'Assessment'];
    const statuses = ['Draft', 'Slot Creation', 'Booking Open', 'Closed', 'Completed'];
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

    onMounted(async () => {
      courses.value = await api('GET', '/courses');
      examiners.value = await api('GET', '/examiners');
      load();
    });
    watch(filt, load);

    const opt = (a) => a.map((x) => ({ value: x, label: x }));
    const fields = computed(() => [
      { key: 'course_id', label: 'Academic Course', type: 'select', required: true, options: courses.value.map((c) => ({ value: c.id, label: c.code + ' &middot; ' + c.name })) },
      { key: 'name', label: 'Examination Title', required: true },
      { key: 'type', label: 'Assessment Type', type: 'select', required: true, options: opt(types) },
      { key: 'duration', label: 'Duration (Minutes)', type: 'number', required: true, min: 1 },
      { key: 'max_marks', label: 'Maximum Marks', type: 'number', required: true, min: 1 },
      { key: 'instructions', label: 'Student Guidelines & Instructions', type: 'textarea' },
      { key: 'slot_start', label: 'Slot Creation Start Date', type: 'date' },
      { key: 'slot_end', label: 'Slot Creation End Date', type: 'date' },
      { key: 'booking_start', label: 'Student Booking Start Date', type: 'date' },
      { key: 'booking_end', label: 'Student Booking End (Cancellation Deadline)', type: 'date' },
    ]);

    const open = (e) => (form.value = { id: e && e.id, initial: e ? { ...e } : { duration: 30, max_marks: 50, type: 'Viva' } });
    const submit = async (d) => {
      await (form.value.id ? api('PUT', '/exams/' + form.value.id, d) : api('POST', '/exams', d));
      toast(form.value.id ? 'Examination updated' : 'Examination created');
      load();
    };
    const setStatus = async (e, status) => {
      await act(() => api('POST', `/exams/${e.id}/status`, { status }), 'Status updated to ' + status);
      load();
    };
    const publish = async (e) => {
      if (!await showConfirm('Publish finalized marks for ' + e.name + '? Results will be instantly visible to all students and can no longer be changed.', { danger: false, confirmText: 'Publish results' })) return;
      let r = false;
      try {
        r = await api('POST', `/exams/${e.id}/publish`);
      } catch (err) {
        if (err.data && err.data.pending_evaluations) {
          // Students are still unevaluated: publishing is final, so ask a second, explicit question.
          if (await showConfirm(err.message + ' Publish anyway?', { confirmText: 'Publish anyway' })) {
            r = await act(() => api('POST', `/exams/${e.id}/publish`, { force: true }));
          }
        } else {
          toast(err.message, 'danger');
        }
      }
      if (r) toast('Results published successfully' + (r.pending_evaluations ? ` (${r.pending_evaluations} students had no evaluation)` : ''));
      load();
    };
    const del = async (e) => {
      if (await showConfirm('Delete ' + e.name + '?', { confirmText: 'Delete' }) && (await act(() => api('DELETE', '/exams/' + e.id), 'Deleted'))) load();
    };

    // Rubrics
    const blankRub = () => ({ criterion: '', max_marks: 10, weightage: 1.0, description: '' });
    const openRub = async (e) => {
      rub.value = {
        exam: e,
        list: await api('GET', `/exams/${e.id}/rubrics`),
        f: blankRub(),
        editing: null,   // id of the criterion being edited, or null when adding a new one
      };
    };
    const editRub = (r) => {
      rub.value.editing = r.id;
      rub.value.f = { criterion: r.criterion, max_marks: r.max_marks, weightage: r.weightage, description: r.description || '' };
    };
    const cancelRubEdit = () => { rub.value.editing = null; rub.value.f = blankRub(); };
    // one form for both: adds a criterion, or saves the one picked with the pencil
    const saveRub = async () => {
      const editing = rub.value.editing;
      const call = editing
        ? () => api('PUT', '/rubrics/' + editing, rub.value.f)
        : () => api('POST', `/exams/${rub.value.exam.id}/rubrics`, rub.value.f);
      if (await act(call, editing ? 'Criterion updated' : 'Criterion added')) {
        rub.value.list = await api('GET', `/exams/${rub.value.exam.id}/rubrics`);
        cancelRubEdit();
      }
    };
    const delRub = async (r) => {
      if (await act(() => api('DELETE', '/rubrics/' + r.id))) {
        rub.value.list = await api('GET', `/exams/${rub.value.exam.id}/rubrics`);
        if (rub.value.editing === r.id) cancelRubEdit();
      }
    };

    // Assign Examiners
    const openAsg = (e) => (asg.value = { exam: e, ids: e.examiners.map((x) => x.id) });
    const saveAsg = async () => {
      if (await act(() => api('PUT', `/exams/${asg.value.exam.id}/examiners`, { examiner_ids: asg.value.ids }), 'Examiners assigned')) {
        asg.value = null;
        load();
      }
    };

    return {
      rows, form, rub, asg, filt, types, statuses, examiners, fields,
      open, submit, setStatus, publish, del, openRub, editRub, saveRub, cancelRubEdit, delRub,
      openAsg, saveAsg, badgeClass, loading,
    };
  },
  template: `
  <div>
    <PageHeader>
      <button class="btn btn-primary" @click="open()">
        <i class="bi bi-plus-lg"></i> New Examination
      </button>
    </PageHeader>

    <FilterBar v-model="filt.q" placeholder="Search examinations by name or course">
      <select class="form-select" v-model="filt.type" aria-label="Filter by type">
        <option value="">All types</option>
        <option v-for="t in types" :key="t">{{ t }}</option>
      </select>
      <select class="form-select" v-model="filt.status" aria-label="Filter by status">
        <option value="">All statuses</option>
        <option v-for="s in statuses" :key="s">{{ s }}</option>
      </select>
    </FilterBar>

    <LoadingBlock v-if="loading" />

    <div v-else class="card">
      <div class="table-responsive">
        <table class="table table-hover mb-0 align-middle table-roomy">
          <thead>
            <tr>
              <th>Examination</th>
              <th>Details</th>
              <th>Examiners</th>
              <th>Status</th>
              <th class="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in rows" :key="e.id">
              <td>
                <div class="fw-bold text-dark">{{ e.name }}</div>
                <div class="d-flex flex-wrap align-items-center gap-2 mt-1">
                  <span class="badge-soft badge-soft-dark" title="Course">{{ e.course_code }}</span>
                  <span class="small text-muted text-nowrap">{{ e.type }}</span>
                </div>
                <div v-if="e.results_published" class="badge-soft badge-soft-success mt-1">
                  <i class="bi bi-check-circle-fill"></i> Results Published
                </div>
              </td>
              <td class="small text-muted text-nowrap">
                <div><i class="bi bi-clock me-1"></i>{{ e.duration }} mins</div>
                <div><i class="bi bi-award me-1"></i>{{ e.max_marks }} marks</div>
              </td>
              <td class="col-examiners">
                <div class="small" v-if="e.examiners.length">
                  <span v-for="(ex, i) in e.examiners" :key="ex.id">
                    {{ ex.name }}<span v-if="i < e.examiners.length - 1">, </span>
                  </span>
                </div>
                <span v-else class="text-danger small"><i class="bi bi-exclamation-circle"></i> None</span>
              </td>
              <td>
                <select class="form-select form-select-sm status-select" :value="e.status" :disabled="!e.next_statuses.length"
                        :title="e.results_published ? 'Results are published; the status is locked' : 'Only valid next steps are offered'"
                        aria-label="Examination status" @change="setStatus(e, $event.target.value)">
                  <option v-for="s in [e.status, ...e.next_statuses]" :key="s">{{ s }}</option>
                </select>
              </td>
              <td class="text-end"><div class="actions-grid">
                <button class="btn btn-sm btn-light" @click="open(e)" title="Edit Examination" aria-label="Edit Examination">
                  <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-sm btn-outline-secondary" @click="openRub(e)" title="Manage Rubric Criteria" aria-label="Manage Rubric Criteria">
                  <i class="bi bi-card-checklist"></i> Rubric
                </button>
                <button class="btn btn-sm btn-outline-secondary" @click="openAsg(e)" title="Assign Examiners" aria-label="Assign Examiners">
                  <i class="bi bi-people"></i> Examiners
                </button>
                <button class="btn btn-sm btn-outline-success" @click="publish(e)" :disabled="e.results_published || !['Closed','Completed'].includes(e.status)" :title="['Closed','Completed'].includes(e.status) || e.results_published ? 'Publish Results' : 'Close the examination first'" aria-label="Publish Results">
                  <i class="bi bi-send-check"></i> Publish
                </button>
                <button class="btn btn-sm btn-outline-danger" @click="del(e)" title="Delete Exam" aria-label="Delete Exam">
                  <i class="bi bi-trash3"></i>
                </button>
              </div></td>
            </tr>
            <EmptyRow v-if="!rows.length" :colspan="5" icon="bi-journal-x" text="No examinations found matching your filter criteria." />
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modals -->
    <FormModal v-if="form" :title="form.id ? 'Edit Examination' : 'New Examination'" :fields="fields" :initial="form.initial" :submit="submit" @close="form = null"/>

    <!-- Rubric Modal -->
    <Modal v-if="rub" :title="'Evaluation Rubrics: ' + rub.exam.name" icon="bi-card-checklist" wide @close="rub = null">
      <div class="panel-inset small text-muted mb-3">
        Define criteria for examiners to score against. Weighted final grade is calculated as:
        <code>(Sum(Marks / Max * Weight) / Sum(Weights)) * Exam Max Marks</code>.
      </div>

      <div class="table-responsive mb-4">
        <table class="table table-sm align-middle">
          <thead>
            <tr>
              <th>Criterion</th>
              <th>Max Marks</th>
              <th>Weight</th>
              <th>Description</th>
              <th class="text-end">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rub.list" :key="r.id">
              <td class="fw-semibold">{{ r.criterion }}</td>
              <td>{{ r.max_marks }}</td>
              <td>{{ r.weightage }}x</td>
              <td class="small text-muted">{{ r.description || '-' }}</td>
              <td class="text-end text-nowrap">
                <button class="btn btn-sm btn-outline-secondary py-0 px-2 me-1" @click="editRub(r)" title="Edit Criterion" aria-label="Edit Criterion"><i class="bi bi-pencil"></i></button>
                <button class="btn btn-sm btn-outline-danger py-0 px-2" @click="delRub(r)" title="Delete Criterion" aria-label="Delete Criterion"><i class="bi bi-x-lg"></i></button>
              </td>
            </tr>
            <EmptyRow v-if="!rub.list.length" :colspan="5" compact text="No rubric criteria added yet. Add at least one below." />
          </tbody>
        </table>
      </div>

      <form class="panel-inset" @submit.prevent="saveRub">
        <h6 class="fw-bold mb-3 small text-uppercase text-muted">{{ rub.editing ? 'Edit Criterion' : 'Add New Criterion' }}</h6>
        <div class="row g-3">
          <div class="col-12 col-md-6">
            <label class="form-label small fw-semibold text-muted mb-1" for="rub-title">Criterion title <span class="text-danger">*</span></label>
            <input id="rub-title" class="form-control" placeholder="e.g. Code Reading" v-model="rub.f.criterion" required>
          </div>
          <div class="col-6 col-md-3">
            <label class="form-label small fw-semibold text-muted mb-1" for="rub-max">Max marks <span class="text-danger">*</span></label>
            <input id="rub-max" type="number" class="form-control" min="0.5" step="0.5" v-model="rub.f.max_marks" required>
          </div>
          <div class="col-6 col-md-3">
            <label class="form-label small fw-semibold text-muted mb-1" for="rub-weight">Weight <span class="text-danger">*</span></label>
            <input id="rub-weight" type="number" class="form-control" min="0.1" step="0.1" v-model="rub.f.weightage" required>
          </div>
          <div class="col-12">
            <label class="form-label small fw-semibold text-muted mb-1" for="rub-notes">Notes <span class="fw-normal">(optional)</span></label>
            <input id="rub-notes" class="form-control" placeholder="What the examiner should look for" v-model="rub.f.description">
          </div>
        </div>
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-3 mt-3">
          <div class="form-text m-0">Weight = importance of the criterion (1 = normal, 2 = counts double).</div>
          <div class="d-flex gap-2">
            <button v-if="rub.editing" type="button" class="btn btn-light" @click="cancelRubEdit">Cancel</button>
            <button class="btn btn-primary" type="submit">
              <i class="bi" :class="rub.editing ? 'bi-check-lg' : 'bi-plus-lg'"></i> {{ rub.editing ? 'Save changes' : 'Add criterion' }}
            </button>
          </div>
        </div>
      </form>
    </Modal>

    <!-- Examiner Assignment Modal -->
    <Modal v-if="asg" :title="'Assign Examiners &middot; ' + asg.exam.name" icon="bi-people" @close="asg = null">
      <p class="small text-muted mb-3">Select the examiners authorized to open slots and evaluate this examination.</p>
      <div class="list-group mb-3">
        <label v-for="x in examiners.filter(x => x.status === 'Active')" :key="x.id" class="list-group-item d-flex align-items-center gap-3">
          <input class="form-check-input flex-shrink-0" type="checkbox" :value="x.id" v-model="asg.ids">
          <div class="flex-grow-1">
            <div class="fw-semibold">{{ x.name }}</div>
            <div class="small text-muted">{{ x.email }} &middot; {{ x.department || 'General' }}</div>
          </div>
        </label>
      </div>
      <div v-if="!examiners.length" class="text-danger small mb-3">No active examiners found in the system.</div>
      <div class="text-end">
        <button class="btn btn-primary" @click="saveAsg"><i class="bi bi-check2"></i> Save Assignments</button>
      </div>
    </Modal>

  </div>`,
};
