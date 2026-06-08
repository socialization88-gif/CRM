import { apiClient } from '../../../services/apiClient.js';

export function getProfiles(query = '') {
  return apiClient(`/api/dataset-rows${query ? `?${query}` : ''}`);
}
