import { readSessionToken } from './storageService.js';

export function resolveApiBase() {
  const configured = (window.API_BASE_URL || localStorage.getItem('apiBaseUrl') || '').trim();
  return configured ? configured.replace(/\/+$/, '') : '';
}

export async function apiClient(path, options = {}) {
  const token = readSessionToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const url = `${resolveApiBase()}${path.startsWith('/') ? path : `/${path}`}`;
  const response = await fetch(url, { ...options, headers });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok || data.ok === false) throw new Error(data.message || 'Request failed');
  return data;
}
