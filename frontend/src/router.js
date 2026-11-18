import { reactive, h, markRaw } from './vue.js';
import { state, token } from './state.js';
import { Login } from './views/Login.js';
import { Register } from './views/Register.js';
import { AdminDash } from './views/AdminDash.js';
import { AdminCourses } from './views/AdminCourses.js';
import { AdminExams } from './views/AdminExams.js';
import { AdminExaminers } from './views/AdminExaminers.js';
import { AdminStudents } from './views/AdminStudents.js';
import { AdminSlots } from './views/AdminSlots.js';
import { AdminSearch } from './views/AdminSearch.js';
import { ExaminerDash } from './views/ExaminerDash.js';
import { ExaminerSlots } from './views/ExaminerSlots.js';
import { ExaminerEvaluate } from './views/ExaminerEvaluate.js';
import { StudentDash } from './views/StudentDash.js';
import { StudentExams } from './views/StudentExams.js';
import { StudentBookings } from './views/StudentBookings.js';
import { StudentResults } from './views/StudentResults.js';
import { Profile } from './views/Profile.js';

const routes = [
  { path: '/', redirect: () => (state.user ? '/' + state.user.role : '/login') },
  { path: '/login', component: Login, meta: { public: true } },
  { path: '/register', component: Register, meta: { public: true } },
  { path: '/admin', component: AdminDash, meta: { role: 'admin' } },
  { path: '/admin/courses', component: AdminCourses, meta: { role: 'admin' } },
  { path: '/admin/exams', component: AdminExams, meta: { role: 'admin' } },
  { path: '/admin/examiners', component: AdminExaminers, meta: { role: 'admin' } },
  { path: '/admin/students', component: AdminStudents, meta: { role: 'admin' } },
  { path: '/admin/slots', component: AdminSlots, meta: { role: 'admin' } },
  { path: '/admin/search', component: AdminSearch, meta: { role: 'admin' } },
  { path: '/examiner', component: ExaminerDash, meta: { role: 'examiner' } },
  { path: '/examiner/slots', component: ExaminerSlots, meta: { role: 'examiner' } },
  { path: '/examiner/evaluate', component: ExaminerEvaluate, meta: { role: 'examiner' } },
  { path: '/student', component: StudentDash, meta: { role: 'student' } },
  { path: '/student/exams', component: StudentExams, meta: { role: 'student' } },
  { path: '/student/bookings', component: StudentBookings, meta: { role: 'student' } },
  { path: '/student/results', component: StudentResults, meta: { role: 'student' } },
  { path: '/profile', component: Profile, meta: { role: ['admin', 'examiner', 'student'] } },
  { path: '*', redirect: '/' },
];

/* Minimal built-in router (no vue-router): History API + a reactive "route" object. Same guard rules as before. */
export const route = reactive({ path: '/', component: null });

export const useRoute = () => route;

function resolvePath(path, depth = 0) {
  const m = routes.find((r) => r.path === path) || routes.find((r) => r.path === '*');
  if (depth > 5) return { path: '/login', m: routes.find((r) => r.path === '/login') };
  if (m.redirect) return resolvePath(typeof m.redirect === 'function' ? m.redirect() : m.redirect, depth + 1);
  const meta = m.meta || {};
  if (meta.public) return state.user ? resolvePath('/' + state.user.role, depth + 1) : { path, m };
  if (!state.user || !token()) return resolvePath('/login', depth + 1);
  if (meta.role && ![].concat(meta.role).includes(state.user.role)) return resolvePath('/' + state.user.role, depth + 1);
  return { path, m };
}

export const router = {
  push(path, replace = false) {
    const r = resolvePath(String(path).split(/[?#]/)[0]);
    if (location.pathname !== r.path) history[replace ? 'replaceState' : 'pushState']({}, '', r.path);
    route.path = r.path;
    route.component = markRaw(r.m.component);
  },
};

window.addEventListener('popstate', () => router.push(location.pathname, true));

export const RouterView = { setup: () => () => (route.component ? h(route.component, { key: route.path }) : null) };

export const RouterLink = {
  props: ['to'],
  setup(props, { slots }) {
    return () => h('a', {
      href: props.to,
      class: { 'router-link-exact-active': route.path === props.to },
      onClick(e) {
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
        e.preventDefault();
        router.push(props.to);
      },
    }, slots.default && slots.default());
  },
};
