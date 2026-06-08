export const AUTH_TOKEN_KEY = 'crm.session.token';
export const AUTH_USER_KEY = 'crm.session.user';

export function readSessionToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY) || sessionStorage.getItem(AUTH_TOKEN_KEY) || '';
}

export function readSessionUser() {
  const raw = localStorage.getItem(AUTH_USER_KEY) || sessionStorage.getItem(AUTH_USER_KEY);
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeSession(token, user) {
  localStorage.setItem(AUTH_TOKEN_KEY, token || '');
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user || null));
}

export function clearSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  sessionStorage.removeItem(AUTH_USER_KEY);
}
