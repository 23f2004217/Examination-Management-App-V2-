import { reactive } from './vue.js';

export const state = reactive({
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  toast: null,
  notifs: [],
  confirm: null,
});

export const token = () => localStorage.getItem('token');

// First name for greetings: "Dr. Rajesh Kumar" -> "Rajesh" (a leading title is not a name).
export const firstNameOf = (name) => String(name || '').trim().replace(/^(dr|prof|mr|mrs|ms|miss)\.?\s+/i, '').split(/\s+/)[0] || 'there';

export function toast(msg, type = 'success') {
  state.toast = { msg, type };
  setTimeout(() => {
    if (state.toast && state.toast.msg === msg) state.toast = null;
  }, 4000);
}

// One confirmation dialog for the whole app (rendered once in App): await showConfirm('Delete X?', { confirmText: 'Delete' })
export function showConfirm(message, opts = {}) {
  return new Promise((resolve) => { state.confirm = { message, resolve, ...opts }; });
}
