import { readSessionUser, writeSession, clearSession } from '../services/storageService.js';

export const authStore = {
  getUser: readSessionUser,
  setSession: writeSession,
  clear: clearSession,
};
