import { state, toast, token } from './state.js';
import { router } from './router.js';

let loggingOut = false;

export async function logout() {
  if (loggingOut) return; // api() calls logout() on 401/422, so guard against re-entry
  loggingOut = true;
  try {
    if (token()) await api('POST', '/auth/logout');
  } catch (e) { /* token already invalid: nothing to revoke */ }
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  state.user = null;
  loggingOut = false;
  router.push('/login');
}

export async function api(method, url, data) {
  const headers = { 'Content-Type': 'application/json' };
  if (token()) headers.Authorization = 'Bearer ' + token();
  const r = await fetch('/api' + url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
  });
  let j = {};
  try { j = await r.json(); } catch (e) { /* empty body */ }
  if (!r.ok) {
    // 401 = expired/revoked token or an account that was deactivated (the body uses "msg" for token errors and
    // "error" for the account check); 422 = malformed token. A wrong password at sign-in has no token yet.
    if (token() && (r.status === 401 || (r.status === 422 && j.msg))) logout();
    const err = new Error(j.error || j.msg || 'Request failed');
    err.status = r.status;
    err.data = j;
    throw err;
  }
  return j;
}

export async function act(fn, okMsg) {
  try {
    const r = await fn();
    if (okMsg) toast(okMsg, 'success');
    return r === undefined ? true : r;
  } catch (e) {
    toast(e.message, 'danger');
    return false;
  }
}
