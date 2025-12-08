// frontend/src/utils/toast.js
import toast from 'react-hot-toast';

export const toastSuccess = (msg) => toast.success(msg || 'Success');
export const toastError = (msg) => toast.error(msg || 'Something went wrong');
