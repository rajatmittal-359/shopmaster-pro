import api from '../utils/api';

export const getAddresses = () => api.get('/customer/addresses');
export const addAddress = (data) => api.post('/customer/addresses', data);
export const updateAddress = (id, data) => api.patch(`/customer/addresses/${id}`, data);
export const deleteAddress = (id) => api.delete(`/customer/addresses/${id}`);

/**
 * Indian PIN code lookup, so city and state fill themselves.
 * 404 means the PIN code does not exist; 503 means we could not check.
 */
export const lookupPincode = (code) => api.get(`/pincode/${code}`);
