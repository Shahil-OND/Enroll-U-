// services/client.js — Axios client for the backend API
import axios from 'axios';

const API = axios.create({ 
  baseURL: import.meta.env.VITE_API_URL || 'https://55q20zc7kj.execute-api.us-west-2.amazonaws.com/prod' 
});

// Attach Cognito JWT / Auth token to all requests if present
API.interceptors.request.use((config) => {
  const token = window.__ENROLLU_AUTH_TOKEN__ || 
    localStorage.getItem('enrollu_auth_token') || 
    sessionStorage.getItem('enrollu_auth_token');

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => Promise.reject(error));

// Expired session & 401 handler — redirects to login when token is invalid or expired
API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !window.location.pathname.startsWith('/login')) {
      console.warn('[API Client] Unauthorized (401) — redirecting to /login');
      localStorage.removeItem('enrollu_auth_token');
      sessionStorage.removeItem('enrollu_auth_token');
      localStorage.removeItem('enrollu_auth_user');
      sessionStorage.removeItem('enrollu_auth_user');
      delete window.__ENROLLU_AUTH_TOKEN__;
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

const parseResponse = (r) => {
  if (r.data?.body) {
    return typeof r.data.body === 'string' 
      ? JSON.parse(r.data.body) 
      : r.data.body;
  }
  return r.data;
};

export const getStats       = ()            => API.get('/documents?stats=true').then(parseResponse);
export const getDocuments   = (status)      => API.get('/documents', { params: status ? { status } : {} }).then(parseResponse);
export const getDocument    = (id)          => API.get(`/documents?document_id=${id}`).then(parseResponse);
export const uploadDocument = (file, onProgress) => {
  return API.post(`/upload?filename=${encodeURIComponent(file.name)}`, file, {
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
    },
    onUploadProgress: e => onProgress && onProgress(Math.round((e.loaded * 100) / e.total)),
  }).then(parseResponse);
};

export const uploadBulkDocuments = async (files, onProgress) => {
  const filePromises = files.map(file => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1] || '';
        resolve({
          filename: file.name,
          base64: base64
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  });

  const payloadFiles = await Promise.all(filePromises);

  return API.post('/upload', {
    batch: true,
    files: payloadFiles
  }, {
    headers: {
      'Content-Type': 'application/json'
    },
    onUploadProgress: e => onProgress && onProgress(Math.round((e.loaded * 100) / e.total)),
  }).then(parseResponse);
};

export const approveDoc   = (id, json)      => API.post(`/documents/${id}/approve`, json).then(parseResponse);
export const rejectDoc    = (id, reason)    => API.post(`/documents/${id}/reject`, { reason }).then(parseResponse);
export const reprocessDoc = (id)            => API.post(`/documents/${id}/reprocess`).then(parseResponse);
export const deleteDoc    = (id)            => API.delete(`/documents/${id}`).then(parseResponse);
export const updateJson   = (id, json)      => API.patch(`/documents/${id}/json`, json).then(parseResponse);
export const getHealth    = ()              => API.get('/health').then(parseResponse);
export const translateText = (text)          => API.post('/translate', { text }).then(parseResponse);
export const pasteText     = (text)          => API.post('/paste', { text }).then(parseResponse);
