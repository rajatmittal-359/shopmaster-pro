// src/services/authService.js
import api from '../utils/api';

export const registerUser = (data) => api.post('/auth/register', data);
export const verifyOtp = (data) => api.post('/auth/verify-otp', data);
export const loginUser = (data) => api.post('/auth/login', data);

/** For anyone whose verification code never arrived. */
export const resendOtp = (email) => api.post('/auth/resend-otp', { email });
export const getMe = () => api.get('/auth/me');

/**
 * For anyone locked out. The reply is deliberately the same whether or not the
 * address has an account, so the UI must not try to read success from it.
 */
export const forgotPassword = (email) =>
  api.post('/auth/forgot-password', { email });

export const resetPassword = (token, password) =>
  api.post('/auth/reset-password', { token, password });
