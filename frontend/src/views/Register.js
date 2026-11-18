import { reactive, ref } from '../vue.js';
import { act, api } from '../api.js';
import { router } from '../router.js';

export const Register = {
  setup() {
    const f = reactive({ name: '', email: '', password: '', phone: '', department: '' });
    const loading = ref(false);
    const submit = async () => {
      loading.value = true;
      try {
        if (await act(() => api('POST', '/auth/register', f), 'Registration successful. Please sign in.')) {
          router.push('/login');
        }
      } finally {
        loading.value = false;
      }
    };
    return { f, loading, submit };
  },
  template: `
  <div class="auth-bg">
    <div class="auth-card" style="max-width: 500px;">
      <div class="auth-card-body">
        <div class="text-center mb-4">
          <div class="d-inline-flex p-3 rounded-circle bg-primary-subtle text-primary mb-3">
            <i class="bi bi-person-plus-fill fs-2"></i>
          </div>
          <h4 class="fw-bold mb-1">Student Registration</h4>
          <p class="text-muted small">Register to book viva & examination slots</p>
        </div>

        <form @submit.prevent="submit">
          <div class="mb-3">
            <label class="form-label small fw-semibold text-muted">Full Name <span class="text-danger">*</span></label>
            <input class="form-control" v-model="f.name" placeholder="e.g. John Doe" required maxlength="100">
          </div>

          <div class="mb-3">
            <label class="form-label small fw-semibold text-muted">Institutional Email <span class="text-danger">*</span></label>
            <input type="email" class="form-control" v-model="f.email" placeholder="john@student.edu" required>
          </div>

          <div class="mb-3">
            <label class="form-label small fw-semibold text-muted">Password (min 6 characters) <span class="text-danger">*</span></label>
            <input type="password" class="form-control" v-model="f.password" placeholder="••••••••" required minlength="6">
          </div>

          <div class="row g-2 mb-4">
            <div class="col-6">
              <label class="form-label small fw-semibold text-muted">Contact Phone</label>
              <input class="form-control" v-model="f.phone" placeholder="+91-98765..." pattern="[0-9+\\- ]{7,15}">
            </div>
            <div class="col-6">
              <label class="form-label small fw-semibold text-muted">Department</label>
              <input class="form-control" v-model="f.department" placeholder="Computer Science">
            </div>
          </div>

          <button class="btn btn-primary w-100 py-2 mb-3" :disabled="loading">
            <span v-if="loading" class="spinner-border spinner-border-sm me-1"></span>
            <i v-else class="bi bi-check2-circle"></i>
            <span>Complete Registration</span>
          </button>
        </form>

        <div class="text-center small text-muted">
          Already registered? <router-link to="/login" class="fw-semibold">Sign in</router-link>
        </div>
      </div>
    </div>
  </div>`,
};
