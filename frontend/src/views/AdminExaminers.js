import { ref, onMounted, watch, computed } from '../vue.js';
import { FormModal } from '../components/Modal.js';
import { api } from '../api.js';
import { toast } from '../state.js';
import { badgeClass } from '../format.js';

export const AdminExaminers = {
  components: { FormModal },
  setup() {
    const rows = ref([]);
    const form = ref(null);
    const q = ref('');
    const loading = ref(false);

    const load = async () => {
      loading.value = true;
      try { rows.value = await api('GET', '/examiners?q=' + encodeURIComponent(q.value)); } finally { loading.value = false; }
    };
    onMounted(load);
    watch(q, load);

    const fields = computed(() => [
      { key: 'name', label: 'Full Name', required: true },
      { key: 'email', label: 'Email Address', type: 'email', required: !form.value?.id },
      { key: 'password', label: form.value?.id ? 'New Password (leave blank to keep current)' : 'Password', type: 'password', required: !form.value?.id, minlength: 6 },
      { key: 'phone', label: 'Contact Phone Number', pattern: '[0-9+\\- ]{7,15}' },
      { key: 'department', label: 'Department / Specialization' },
      { key: 'status', label: 'Account Status', type: 'select', required: true, options: [{ value: 'Active', label: 'Active (Approved)' }, { value: 'Inactive', label: 'Inactive (Revoked)' }] },
    ]);

    const open = (x) => (form.value = { id: x && x.id, initial: x ? { ...x, password: '' } : { status: 'Active' } });
    const submit = async (d) => {
      await (form.value.id ? api('PUT', '/examiners/' + form.value.id, d) : api('POST', '/examiners', d));
      toast(form.value.id ? 'Examiner updated' : 'Examiner created');
      load();
    };

    return { rows, form, q, fields, open, submit, badgeClass, loading };
  },
  template: `
  <div>
    <PageHeader>
      <button class="btn btn-primary" @click="open()">
        <i class="bi bi-person-plus"></i> New Examiner
      </button>
    </PageHeader>

    <FilterBar v-model="q" placeholder="Search examiners by name, email or department" />

    <LoadingBlock v-if="loading" />

    <div v-else class="card">
      <div class="table-responsive">
        <table class="table table-hover mb-0 align-middle">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Department</th>
              <th>Status</th>
              <th class="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="x in rows" :key="x.id">
              <td class="fw-bold text-dark">{{ x.name }}</td>
              <td>{{ x.email }}</td>
              <td>{{ x.phone || '-' }}</td>
              <td><span class="badge-soft badge-soft-info">{{ x.department || 'General' }}</span></td>
              <td><StatusBadge :status="x.status" /></td>
              <td class="text-end">
                <button class="btn btn-sm btn-light" @click="open(x)" title="Edit Examiner" aria-label="Edit Examiner">
                  <i class="bi bi-pencil"></i>
                </button>
              </td>
            </tr>
            <EmptyRow v-if="!rows.length" :colspan="6" icon="bi-person-x" text="No examiners found matching the search query." />
          </tbody>
        </table>
      </div>
    </div>

    <FormModal v-if="form" :title="form.id ? 'Edit Examiner' : 'New Examiner'" :fields="fields" :initial="form.initial" :submit="submit" @close="form = null"/>
  </div>`,
};
