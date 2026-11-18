import { ref, onMounted } from '../vue.js';
import { FormModal } from '../components/Modal.js';
import { act, api } from '../api.js';
import { showConfirm, toast } from '../state.js';
import { badgeClass } from '../format.js';

export const AdminCourses = {
  components: { FormModal },
  setup() {
    const rows = ref([]);
    const form = ref(null);
    const loading = ref(false);
    const load = async () => {
      loading.value = true;
      try { rows.value = await api('GET', '/courses'); } finally { loading.value = false; }
    };
    onMounted(load);

    const fields = [
      { key: 'code', label: 'Course Code (e.g. CS101)', required: true, maxlength: 20 },
      { key: 'name', label: 'Course Title', required: true },
      { key: 'description', label: 'Curriculum Description', type: 'textarea' },
      { key: 'status', label: 'Status', type: 'select', required: true, options: [{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }] },
    ];

    const open = (c) => (form.value = { initial: c ? { ...c } : { status: 'Active' }, id: c && c.id });
    const submit = async (d) => {
      await (form.value.id ? api('PUT', '/courses/' + form.value.id, d) : api('POST', '/courses', d));
      toast(form.value.id ? 'Course updated' : 'Course created');
      load();
    };
    const del = async (c) => {
      if (await showConfirm('Are you sure you want to delete course ' + c.code + '? All related exams must be deleted first.', { confirmText: 'Delete' })) {
        if (await act(() => api('DELETE', '/courses/' + c.id), 'Course removed')) load();
      }
    };

    return { rows, form, fields, open, submit, del, badgeClass, loading };
  },
  template: `
  <div>
    <PageHeader>
      <button class="btn btn-primary" @click="open()">
        <i class="bi bi-plus-lg"></i> New Course
      </button>
    </PageHeader>

    <LoadingBlock v-if="loading" />

    <div v-else class="card">
      <div class="table-responsive">
        <table class="table table-hover mb-0 align-middle">
          <thead>
            <tr>
              <th>Course Code</th>
              <th>Course Name</th>
              <th>Description</th>
              <th>Status</th>
              <th class="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in rows" :key="c.id">
              <td><span class="fw-bold text-dark">{{ c.code }}</span></td>
              <td>{{ c.name }}</td>
              <td class="text-muted small" style="max-width:320px">{{ c.description || '-' }}</td>
              <td><StatusBadge :status="c.status" /></td>
              <td class="text-end">
                <button class="btn btn-sm btn-light me-1" @click="open(c)" title="Edit Course" aria-label="Edit Course">
                  <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" @click="del(c)" title="Delete Course" aria-label="Delete Course">
                  <i class="bi bi-trash3"></i>
                </button>
              </td>
            </tr>
            <EmptyRow v-if="!rows.length" :colspan="5" icon="bi-book" text="No courses registered yet. Click &quot;New Course&quot; to get started." />
          </tbody>
        </table>
      </div>
    </div>

    <FormModal v-if="form" :title="form.id ? 'Edit Course' : 'New Course'" :fields="fields" :initial="form.initial" :submit="submit" @close="form = null"/>
  </div>`,
};
