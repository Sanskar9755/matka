/**
 * Axios instance with JWT auth header injection.
 */
import axios from 'axios';

const TOKEN_KEY = 'matka_token';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach JWT from localStorage on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

export default api;
