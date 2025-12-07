import api from '../utils/api';

export const getInventoryLogs = (params = {}) =>
  api.get('/inventory', { params });
