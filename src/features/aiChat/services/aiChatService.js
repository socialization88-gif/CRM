import { apiClient } from '../../../services/apiClient.js';

export function askAi(payload) {
  return apiClient('/api/ai/query', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
