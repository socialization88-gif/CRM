import { apiClient } from '../../../services/apiClient.js';

export function login(credentials) {
  return apiClient('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
}
