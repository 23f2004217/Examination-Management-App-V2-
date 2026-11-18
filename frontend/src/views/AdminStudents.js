import { ref, onMounted, watch } from '../vue.js';
import { act, api } from '../api.js';
import { badgeClass } from '../format.js';

export const AdminStudents = {
  setup() {
    const rows = ref([]);
    const q = ref('');
    const loading = ref(false);

    const load = async () => {
      loading.value = true;
      try { rows.value = await api('GET', '/students?q=' + encodeURIComponent(q.value)); } finally { loading.value = false; }
    };
    onMounted(load);
    watch(q, load);

    const toggle = async (s) => {
      const next = s.status === 'Active' ? 'Inactive' : 'Active';
      await act(() => api('PUT', `/students/${s.id}/status`, { status: next }), 'Student ' + (next === 'Active' ? 'activated' : 'deactivated'));
      load();
    };

    return { rows, q, toggle, badgeClass, loading };
  },
  template: `
  <div>
    <PageHeader />

    <FilterBar v-model="q" placeholder="Search students by name, ID, email or department" />

    <LoadingBlock v-if="loading" />

    <div v-else class="card">
      <div class="table-responsive">
        <table class="table table-hover mb-0 align-middle">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Department</th>
              <th>Status</th>
              <th class="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in rows" :key="s.id">
              <td><span class="badge-soft badge-soft-dark">#{{ s.id }}</span></td>
              <td class="fw-bold text-dark">{{ s.name }}</td>
              <td>{{ s.email }}</td>
              <td>{{ s.phone || '-' }}</td>
              <td>{{ s.department || '-' }}</td>
              <td><StatusBadge :status="s.status" /></td>
              <td class="text-end">
                <button class="btn btn-sm" :class="s.status === 'Active' ? 'btn-outline-danger' : 'btn-outline-success'" @click="toggle(s)">
                  <i :class="s.status === 'Active' ? 'bi bi-person-x' : 'bi bi-person-check'"></i>
                  {{ s.status === 'Active' ? 'Deactivate' : 'Activate' }}
                </button>
              </td>
            </tr>
            <EmptyRow v-if="!rows.length" :colspan="7" icon="bi-mortarboard" text="No students match the search criteria." />
          </tbody>
        </table>
      </div>
    </div>
  </div>`,
};
