import { ref, onMounted, onBeforeUnmount, watch, computed } from './vue.js';
import { pageMeta } from './pageMeta.js';
import { ConfirmModal } from './components/Modal.js';
import { state } from './state.js';
import { api, logout } from './api.js';
import { route, useRoute } from './router.js';

const navLinks = Object.fromEntries(Object.entries({
  admin: [['/admin', 'bi-speedometer2'], ['/admin/courses', 'bi-book-half'], ['/admin/exams', 'bi-journal-check'],
    ['/admin/examiners', 'bi-person-badge'], ['/admin/students', 'bi-mortarboard'], ['/admin/slots', 'bi-calendar3-range'],
    ['/admin/search', 'bi-search'], ['/profile', 'bi-gear']],
  examiner: [['/examiner', 'bi-speedometer2'], ['/examiner/slots', 'bi-calendar-check'],
    ['/examiner/evaluate', 'bi-check2-square'], ['/profile', 'bi-gear']],
  student: [['/student', 'bi-speedometer2'], ['/student/exams', 'bi-journal-text'], ['/student/bookings', 'bi-calendar3-event'],
    ['/student/results', 'bi-trophy'], ['/profile', 'bi-gear']],
}).map(([role, items]) => [role, items.map(([path, icon]) => [path, pageMeta[path].title, icon])]));

export const App = {
  components: { ConfirmModal },
  setup() {
    const notifOpen = ref(false);
    const navOpen = ref(false);
    // Desktop: clicking the logo collapses the sidebar to an icon rail (and back). The choice is remembered per browser.
    // On a phone the sidebar is a drawer instead, so the logo just closes it.
    const collapsed = ref(false);
    try { collapsed.value = localStorage.getItem('navCollapsed') === '1'; } catch (e) { /* storage unavailable: start expanded */ }
    const toggleRail = () => {
      if (window.matchMedia('(max-width: 991px)').matches) { navOpen.value = false; return; }
      collapsed.value = !collapsed.value;
      try { localStorage.setItem('navCollapsed', collapsed.value ? '1' : '0'); } catch (e) { /* ignore */ }
    };
    let timer;

    const loadNotifications = async () => {
      if (state.user) {
        try { state.notifs = await api('GET', '/notifications'); } catch (e) { /* ignore */ }
      }
    };

    onMounted(() => {
      loadNotifications();
      timer = setInterval(() => {
        if (!document.hidden && state.user) loadNotifications();
      }, 45000);
    });
    onBeforeUnmount(() => clearInterval(timer));
    watch(() => state.user, loadNotifications);

    const unreadCount = computed(() => state.notifs.filter((n) => !n.read).length);

    const toggleNotifs = async () => {
      notifOpen.value = !notifOpen.value;
      if (!notifOpen.value && unreadCount.value) {
        await api('POST', '/notifications/read');
        loadNotifications();
      }
    };

    const markAllRead = async () => {
      await api('POST', '/notifications/read');
      loadNotifications();
    };

    const route = useRoute();
    const currentTitle = computed(() => {
      if (!state.user) return 'Examination Management Portal';
      const list = navLinks[state.user.role] || [];
      const item = list.find((x) => x[0] === route.path);
      return item ? item[1] : 'Examination Management Portal';
    });

    const userInitial = computed(() => (state.user ? state.user.name.charAt(0).toUpperCase() : 'U'));
    const answerConfirm = (ok) => {
      const c = state.confirm;
      state.confirm = null;
      if (c) c.resolve(ok);
    };

    return {
      state, navLinks, notifOpen, navOpen, collapsed, toggleRail, unreadCount,
      toggleNotifs, markAllRead, logout, currentTitle, userInitial, answerConfirm,
    };
  },
  template: `
  <div v-if="state.user" :class="['role-' + state.user.role, { 'rail-collapsed': collapsed }]">
    <!-- Sidebar -->
    <aside class="sidebar no-print" :class="{ open: navOpen }">
      <div class="brand" role="button" tabindex="0" :aria-expanded="!collapsed"
           :aria-label="collapsed ? 'Expand sidebar' : 'Collapse sidebar'" :title="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
           @click="toggleRail" @keydown.enter.prevent="toggleRail" @keydown.space.prevent="toggleRail">
        <div class="logo-icon">E</div>
        <div class="brand-meta">
          <div class="brand-title">EMP Portal</div>
          <div class="brand-sub">{{ state.user.role }} workspace</div>
        </div>
      </div>

      <div class="nav-section">
        <div class="nav-label">Navigation Menu</div>
        <router-link v-for="l in navLinks[state.user.role]" :key="l[0]" :to="l[0]" class="side-link" :title="l[1]" @click="navOpen = false">
          <i :class="'bi ' + l[2]"></i>
          <span>{{ l[1] }}</span>
        </router-link>
      </div>

      <div class="sidebar-footer">
        <div class="role-badge-box">
          <div class="avatar" style="width:28px;height:28px;font-size:0.8rem;">{{ userInitial }}</div>
          <div class="flex-grow-1 overflow-hidden">
            <div class="fw-semibold text-truncate small">{{ state.user.name }}</div>
            <div class="text-muted text-uppercase" style="font-size:0.65rem;letter-spacing:0.05em;">{{ state.user.role }}</div>
          </div>
        </div>
      </div>
    </aside>

    <!-- Mobile Overlay -->
    <div class="scrim d-lg-none no-print" v-if="navOpen" @click="navOpen = false"></div>

    <!-- Main Viewport -->
    <div class="main">
      <header class="topbar no-print">
        <button class="icon-btn d-lg-none" @click="navOpen = !navOpen" aria-label="Toggle Navigation">
          <i class="bi bi-list fs-5"></i>
        </button>

        <div class="page-heading crumbs">
          <span class="text-capitalize">{{ state.user.role }}</span>
          <i class="bi bi-chevron-right"></i>
          <strong>{{ currentTitle }}</strong>
        </div>

        <!-- Notification Bell -->
        <div class="position-relative">
          <button class="icon-btn" @click="toggleNotifs" aria-label="Notifications">
            <i class="bi bi-bell fs-5"></i>
            <span v-if="unreadCount" class="badge-dot"></span>
          </button>

          <!-- Notifications Dropdown Flyout -->
          <div v-if="notifOpen" class="notif-panel">
            <div class="notif-header">
              <span>Notifications <span v-if="unreadCount" class="badge-soft badge-soft-danger ms-1">{{ unreadCount }} new</span></span>
              <button class="btn btn-link btn-sm text-decoration-none p-0" style="font-size:0.75rem" @click="markAllRead">
                Mark all read
              </button>
            </div>
            <div class="notif-list">
              <div class="notif-item" v-for="n in state.notifs" :key="n.id" :class="{ unread: !n.read }">
                <div class="fw-medium text-dark">{{ n.message }}</div>
                <div class="text-muted small mt-1">
                  <i class="bi bi-clock me-1"></i>{{ (n.created_at || '').slice(0, 16).replace('T', ' ') }}
                </div>
              </div>
              <div v-if="!state.notifs.length" class="text-center py-4 text-muted small">
                <i class="bi bi-bell-slash fs-3 d-block text-secondary mb-1"></i>
                No notifications right now.
              </div>
            </div>
          </div>
        </div>

        <!-- User Info & Avatar -->
        <div class="d-none d-md-flex align-items-center gap-2">
          <div class="text-end lh-sm">
            <div class="small fw-bold text-dark">{{ state.user.name }}</div>
            <div class="text-muted" style="font-size:0.72rem">{{ state.user.email }}</div>
          </div>
          <div class="avatar" :title="state.user.name">{{ userInitial }}</div>
        </div>

        <!-- Logout Button -->
        <button class="btn btn-sm btn-outline-secondary" @click="logout" title="Sign Out" aria-label="Sign Out">
          <i class="bi bi-box-arrow-right"></i>
          <span class="d-none d-sm-inline">Sign Out</span>
        </button>
      </header>

      <main class="content">
        <router-view />
      </main>
    </div>
  </div>

  <div v-else>
    <router-view />
  </div>

  <ConfirmModal v-if="state.confirm" :title="state.confirm.title" :message="state.confirm.message"
                :confirm-text="state.confirm.confirmText" :cancel-text="state.confirm.cancelText"
                :danger="state.confirm.danger !== false" @confirm="answerConfirm(true)" @cancel="answerConfirm(false)" />

  <!-- Toast Container -->
  <div class="toast-box no-print" v-if="state.toast">
    <div class="alert toast-pill text-white shadow-lg" :class="state.toast.type === 'danger' ? 'bg-danger' : 'bg-dark'">
      <i :class="state.toast.type === 'danger' ? 'bi bi-exclamation-triangle-fill fs-5' : 'bi bi-check-circle-fill text-success fs-5'"></i>
      <div class="small fw-semibold">{{ state.toast.msg }}</div>
    </div>
  </div>`,
};
