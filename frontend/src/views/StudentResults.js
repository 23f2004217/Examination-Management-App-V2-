import { ref, onMounted, computed } from '../vue.js';
import { Modal } from '../components/Modal.js';
import { api } from '../api.js';
import { state, toast, token } from '../state.js';
import { fmtDate } from '../format.js';

export const StudentResults = {
  components: { Modal },
  setup() {
    const rows = ref([]);
    const sel = ref(null);
    const loading = ref(false);
    const downloading = ref(false);

    onMounted(async () => {
      loading.value = true;
      try { rows.value = await api('GET', '/results'); } finally { loading.value = false; }
    });

    // Real file download (no print dialog): the server builds the PDF, the browser saves it.
    const downloadScorecard = async (b) => {
      downloading.value = true;
      try {
        const r = await fetch(`/api/bookings/${b.id}/scorecard.pdf`, { headers: { Authorization: 'Bearer ' + token() } });
        if (!r.ok) {
          const e = await r.json().catch(() => ({}));
          toast(e.error || 'Could not download the scorecard', 'danger');
          return;
        }
        const url = URL.createObjectURL(await r.blob());
        const a = document.createElement('a');
        a.href = url;
        a.download = 'scorecard_' + (b.exam_name || 'exam').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') + '.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        toast('Scorecard downloaded');
      } finally {
        downloading.value = false;
      }
    };

    return {
      rows, sel, user: computed(() => state.user || {}),
      print: () => window.print(), downloadScorecard, downloading, fmtDate, loading,
    };
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
              <th>Marks Secured</th>
              <th>Examiner Feedback</th>
              <th class="text-end">Scorecard</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="b in rows" :key="b.id">
              <td class="fw-bold text-dark">{{ b.exam_name }}</td>
              <td><span class="badge-soft badge-soft-dark">{{ b.course }}</span></td>
              <td><span class="fs-6 fw-bold text-success">{{ b.evaluation.total_marks }} / {{ b.max_marks }}</span></td>
              <td class="small text-muted" style="max-width:320px;">{{ b.evaluation.remarks || 'No remarks provided.' }}</td>
              <td class="text-end">
                <div class="d-flex justify-content-end gap-2">
                  <button class="btn btn-sm btn-primary" @click="sel = b">
                    <i class="bi bi-file-earmark-text"></i> View Scorecard
                  </button>
                  <button class="btn btn-sm btn-outline-primary" @click="downloadScorecard(b)" :disabled="downloading"
                          title="Download the scorecard as a PDF" aria-label="Download the scorecard as a PDF">
                    <i class="bi bi-download"></i> PDF
                  </button>
                </div>
              </td>
            </tr>
            <EmptyRow v-if="!rows.length" :colspan="5" icon="bi-award" text="No examination results have been published yet. Check back soon." />
          </tbody>
        </table>
      </div>
    </div>

    <!-- Official Printable Scorecard Modal -->
    <Modal v-if="sel" title="Official Academic Scorecard" icon="bi-award" wide @close="sel = null">
      <div class="p-4 border rounded bg-white" style="border-top: 4px solid var(--accent) !important;">
        <!-- Header -->
        <div class="text-center pb-3 mb-3 border-bottom">
          <div class="d-inline-flex p-2 rounded-circle bg-primary-subtle text-primary mb-2">
            <i class="bi bi-mortarboard-fill fs-3"></i>
          </div>
          <h5 class="fw-bold mb-0">EXAMINATION MANAGEMENT PORTAL</h5>
          <div class="text-muted small text-uppercase" style="letter-spacing: 0.08em;">Official Assessment Transcript &middot; MAD 2</div>
        </div>

        <!-- Details Grid -->
        <div class="row g-2 mb-4 small">
          <div class="col-6">
            <div class="text-muted">Student Name:</div>
            <div class="fw-bold">{{ user.name }} ({{ user.email }})</div>
          </div>
          <div class="col-6">
            <div class="text-muted">Examination:</div>
            <div class="fw-bold">{{ sel.exam_name }} ({{ sel.course }})</div>
          </div>
          <div class="col-6">
            <div class="text-muted">Examiner:</div>
            <div class="fw-bold">{{ sel.examiner_name }}</div>
          </div>
          <div class="col-6">
            <div class="text-muted">Evaluation Date:</div>
            <div class="fw-bold">{{ fmtDate((sel.evaluation.evaluated_at || '').slice(0, 10)) }}</div>
          </div>
        </div>

        <!-- Criteria Marks Breakdown -->
        <div class="table-responsive mb-3">
          <table class="table table-bordered table-sm align-middle">
            <thead class="bg-light">
              <tr>
                <th>Rubric Criterion</th>
                <th class="text-center" style="width: 140px;">Marks Scored</th>
                <th class="text-center" style="width: 140px;">Max Marks</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in sel.evaluation.scores" :key="s.rubric_id">
                <td>{{ s.criterion }}</td>
                <td class="text-center fw-semibold text-primary">{{ s.marks }}</td>
                <td class="text-center text-muted">{{ s.max_marks }}</td>
              </tr>
            </tbody>
            <tfoot class="table-light fw-bold">
              <tr>
                <td>Final Weighted Total</td>
                <td class="text-center text-success fs-6">{{ sel.evaluation.total_marks }}</td>
                <td class="text-center fs-6">{{ sel.max_marks }}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <!-- Feedback & Signatures -->
        <div class="panel-inset mb-4">
          <div class="small fw-semibold text-muted text-uppercase mb-1">Examiner Remarks</div>
          <div class="small text-secondary">{{ sel.evaluation.remarks || 'No remarks provided.' }}</div>
        </div>

        <div class="row pt-4 text-center small text-muted">
          <div class="col-6">
            <div class="pt-2 border-top mx-auto" style="max-width: 180px;">Evaluated By (Examiner)</div>
          </div>
          <div class="col-6">
            <div class="pt-2 border-top mx-auto" style="max-width: 180px;">Controller of Examinations</div>
          </div>
        </div>
      </div>

      <div class="d-flex justify-content-end gap-2 mt-3 no-print">
        <button class="btn btn-outline-secondary" @click="print">
          <i class="bi bi-printer"></i> Print
        </button>
        <button class="btn btn-primary" @click="downloadScorecard(sel)" :disabled="downloading">
          <i class="bi bi-download"></i> Download PDF
        </button>
      </div>
    </Modal>
  </div>`,
};
