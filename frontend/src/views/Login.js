import { reactive, ref } from '../vue.js';
import { act, api } from '../api.js';
import { state } from '../state.js';
import { router } from '../router.js';

export const Login = {
  setup() {
    // Choosing a role is optional: if the person does, the server checks the account really has that role.
    const roles = [
      { value: 'admin', label: 'Admin', icon: 'bi-shield-lock' },
      { value: 'examiner', label: 'Examiner', icon: 'bi-person-badge' },
      { value: 'student', label: 'Student', icon: 'bi-mortarboard' },
    ];
    const f = reactive({ role: '', email: '', password: '' });
    const showPass = ref(false);
    const loading = ref(false);
    const roleMissing = ref(false);

    const submit = async () => {
      roleMissing.value = false;
      loading.value = true;
      try {
        // The role buttons are optional: with none chosen the server signs the account in as its own role.
        const payload = { email: f.email, password: f.password };
        if (f.role) payload.role = f.role;
        const r = await act(() => api('POST', '/auth/login', payload));
        if (!r) return;
        localStorage.setItem('token', r.token);
        localStorage.setItem('user', JSON.stringify(r.user));
        state.user = r.user;
        router.push('/' + r.user.role);
      } finally {
        loading.value = false;
      }
    };

    // Demo shortcuts exist only when the server was started with EMP_DEMO_LOGIN=1 (it then adds them to the page).
    // Nothing is hard-coded in this file, so a normal deployment exposes no credentials.
    let demo = [];
    try { demo = JSON.parse(document.querySelector('meta[name="emp-demo"]').content); } catch (e) { /* demo mode off */ }
    const demoIcon = { Admin: 'bi-shield-lock', Examiner: 'bi-person-badge', Student: 'bi-mortarboard' };

    const quickFill = (a) => {
      f.role = a.role.toLowerCase();
      f.email = a.email;
      f.password = a.password;
      submit();
    };

    return { f, roles, roleMissing, showPass, loading, submit, quickFill, demo, demoIcon };
  },
  template: `
  <div class="auth-bg">
    <div class="auth-card">
      <div class="auth-card-body">
        <div class="text-center mb-4">
          <div class="d-inline-flex p-3 rounded-circle bg-primary-subtle text-primary mb-3">
            <i class="bi bi-mortarboard-fill fs-2"></i>
          </div>
          <h4 class="fw-bold mb-1">Welcome to EMP</h4>
          <p class="text-muted small">Examination Management Portal &middot; V2</p>
        </div>

        <!-- Quick Demo Switcher (only when the server runs with EMP_DEMO_LOGIN=1) -->
        <div v-if="demo.length" class="p-3 mb-4 rounded-3 bg-light border">
          <div class="small fw-semibold text-muted text-uppercase mb-2" style="font-size:0.7rem; letter-spacing:0.05em">
            <i class="bi bi-lightning-charge-fill text-warning me-1"></i>One-Click Demo Login
          </div>
          <div class="d-flex flex-wrap gap-1">
            <button v-for="a in demo" :key="a.role" type="button" class="demo-role-btn flex-fill" @click="quickFill(a)">
              <i class="bi me-1" :class="demoIcon[a.role]"></i>{{ a.role }}
            </button>
          </div>
        </div>

        <form @submit.prevent="submit">
          <div class="mb-3" role="radiogroup" aria-labelledby="role-label">
            <div id="role-label" class="form-label small fw-semibold text-muted">Sign in as <span class="fw-normal">(optional)</span></div>
            <div class="role-choice">
              <label v-for="r in roles" :key="r.value" class="role-option" :class="{ active: f.role === r.value }">
                <input type="radio" name="role" class="visually-hidden" :value="r.value" v-model="f.role" @change="roleMissing = false">
                <i class="bi" :class="r.icon"></i>
                <span>{{ r.label }}</span>
              </label>
            </div>
            <div v-if="roleMissing" class="text-danger small mt-1" role="alert">Choose how you are signing in: Admin, Examiner or Student.</div>
          </div>

          <div class="mb-3">
            <label class="form-label small fw-semibold text-muted">Email address</label>
            <div class="input-group">
              <span class="input-group-text bg-light text-muted border-end-0"><i class="bi bi-envelope"></i></span>
              <input type="email" class="form-control border-start-0" v-model="f.email" placeholder="name@domain.edu" required>
            </div>
          </div>

          <div class="mb-4">
            <label class="form-label small fw-semibold text-muted">Password</label>
            <div class="input-group">
              <span class="input-group-text bg-light text-muted border-end-0"><i class="bi bi-lock"></i></span>
              <input :type="showPass ? 'text' : 'password'" class="form-control border-start-0 border-end-0" v-model="f.password" placeholder="••••••••" required>
              <button class="btn btn-light border border-start-0" type="button" @click="showPass = !showPass">
                <i :class="showPass ? 'bi bi-eye-slash text-muted' : 'bi bi-eye text-muted'"></i>
              </button>
            </div>
          </div>

          <button class="btn btn-primary w-100 py-2 mb-3" :disabled="loading">
            <span v-if="loading" class="spinner-border spinner-border-sm me-1"></span>
            <i v-else class="bi bi-box-arrow-in-right"></i>
            <span>Sign In</span>
          </button>
        </form>

        <div class="text-center small text-muted">
          New student? <router-link to="/register" class="fw-semibold">Create account</router-link>
        </div>
      </div>
    </div>
  </div>`,
};
