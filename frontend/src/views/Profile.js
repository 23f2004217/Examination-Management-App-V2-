import { reactive, ref, onMounted } from '../vue.js';
import { act, api } from '../api.js';
import { state } from '../state.js';

export const Profile = {
  setup() {
    const f = reactive({ name: '', phone: '', department: '', password: '' });
    const saving = ref(false);

    onMounted(async () => {
      Object.assign(f, await api('GET', '/auth/me'), { password: '' });
    });

    const save = async () => {
      saving.value = true;
      try {
        const r = await act(() => api('PUT', '/auth/me', f), 'Profile changes saved');
        if (r && r.name) {
          state.user = r;
          localStorage.setItem('user', JSON.stringify(r));
          f.password = '';
        }
      } finally {
        saving.value = false;
      }
    };

    return { f, saving, save };
  },
  template: `
  <div>
    <PageHeader />

    <div class="card" style="max-width: 580px;">
      <div class="card-body p-4">
        <form @submit.prevent="save">
          <div class="mb-3">
            <label class="form-label small fw-semibold text-muted">Full Name <span class="text-danger">*</span></label>
            <input class="form-control" v-model="f.name" required>
          </div>

          <div class="mb-3">
            <label class="form-label small fw-semibold text-muted">Email Address (Read-only)</label>
            <input class="form-control bg-light" :value="f.email" disabled>
          </div>

          <div class="mb-3">
            <label class="form-label small fw-semibold text-muted">Contact Phone Number</label>
            <input class="form-control" v-model="f.phone" pattern="[0-9+\\- ]{7,15}" placeholder="+91-...">
          </div>

          <div class="mb-3">
            <label class="form-label small fw-semibold text-muted">Department / Division</label>
            <input class="form-control" v-model="f.department" placeholder="e.g. Computer Science">
          </div>

          <div class="mb-4">
            <label class="form-label small fw-semibold text-muted">Change Password (optional)</label>
            <input type="password" class="form-control" v-model="f.password" minlength="6" placeholder="Leave blank to preserve current password">
          </div>

          <button class="btn btn-primary" :disabled="saving">
            <span v-if="saving" class="spinner-border spinner-border-sm me-1"></span>
            <i v-else class="bi bi-check2"></i>
            <span>Update Profile</span>
          </button>
        </form>
      </div>
    </div>
  </div>`,
};
