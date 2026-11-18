import { ref, watch } from '../vue.js';
import { api } from '../api.js';
import { badgeClass } from '../format.js';

export const AdminSearch = {
  setup() {
    const q = ref('');
    const r = ref(null);
    const loading = ref(false);
    let t;

    watch(q, () => {
      clearTimeout(t);
      if (!q.value.trim()) { r.value = null; return; }
      loading.value = true;
      t = setTimeout(async () => {
        try {
          r.value = await api('GET', '/admin/search?q=' + encodeURIComponent(q.value));
        } finally {
          loading.value = false;
        }
      }, 300);
    });

    return { q, r, loading, badgeClass };
  },
  template: `
  <div>
    <PageHeader />

    <FilterBar v-model="q" placeholder="Search students, examiners, examinations and bookings" autofocus />

    <LoadingBlock v-if="loading" />

    <div v-else-if="r" class="row g-3">
      <!-- Students -->
      <div class="col-md-6">
        <div class="card h-100">
          <div class="card-title-bar">
            <span><i class="bi bi-mortarboard"></i>Students</span>
            <span class="badge-soft badge-soft-primary">{{ r.students.length }}</span>
          </div>
          <ul class="list-group list-group-flush">
            <li class="list-group-item" v-for="s in r.students" :key="s.id">
              <div class="fw-semibold">#{{ s.id }} {{ s.name }}</div>
              <div class="small text-muted">{{ s.email }} &middot; {{ s.department || 'General' }}</div>
            </li>
            <li v-if="!r.students.length" class="list-group-item text-muted small py-3 text-center">No students found</li>
          </ul>
        </div>
      </div>

      <!-- Examiners -->
      <div class="col-md-6">
        <div class="card h-100">
          <div class="card-title-bar">
            <span><i class="bi bi-person-badge"></i>Examiners</span>
            <span class="badge-soft badge-soft-info">{{ r.examiners.length }}</span>
          </div>
          <ul class="list-group list-group-flush">
            <li class="list-group-item" v-for="x in r.examiners" :key="x.id">
              <div class="fw-semibold">{{ x.name }}</div>
              <div class="small text-muted">{{ x.email }} &middot; {{ x.department || 'General' }}</div>
            </li>
            <li v-if="!r.examiners.length" class="list-group-item text-muted small py-3 text-center">No examiners found</li>
          </ul>
        </div>
      </div>

      <!-- Examinations -->
      <div class="col-md-6">
        <div class="card h-100">
          <div class="card-title-bar">
            <span><i class="bi bi-journal-check"></i>Examinations</span>
            <span class="badge-soft badge-soft-dark">{{ r.exams.length }}</span>
          </div>
          <ul class="list-group list-group-flush">
            <li class="list-group-item" v-for="e in r.exams" :key="e.id">
              <div class="d-flex justify-content-between align-items-center">
                <div class="fw-semibold">{{ e.name }}</div>
                <StatusBadge :status="e.status" />
              </div>
              <div class="small text-muted">{{ e.course_code }} &middot; {{ e.type }}</div>
            </li>
            <li v-if="!r.exams.length" class="list-group-item text-muted small py-3 text-center">No examinations found</li>
          </ul>
        </div>
      </div>

      <!-- Bookings -->
      <div class="col-md-6">
        <div class="card h-100">
          <div class="card-title-bar">
            <span><i class="bi bi-ticket-detailed"></i>Bookings</span>
            <span class="badge-soft badge-soft-warning">{{ r.bookings.length }}</span>
          </div>
          <ul class="list-group list-group-flush">
            <li class="list-group-item" v-for="b in r.bookings" :key="b.id">
              <div class="d-flex justify-content-between align-items-center">
                <span class="fw-semibold">#{{ b.id }} {{ b.student_name }}</span>
                <StatusBadge :status="b.status" />
              </div>
              <div class="small text-muted">&rarr; {{ b.exam_name }}</div>
            </li>
            <li v-if="!r.bookings.length" class="list-group-item text-muted small py-3 text-center">No bookings found</li>
          </ul>
        </div>
      </div>
    </div>
  </div>`,
};
