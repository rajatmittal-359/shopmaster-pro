import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { registerUser, verifyOtp, loginUser, getMe } from '../../services/authService';

const tokenFromStorage = localStorage.getItem('smp_token');
const roleFromStorage = localStorage.getItem('smp_role');

const initialState = {
  user: null,
  token: tokenFromStorage || null,
  role: roleFromStorage || null,
  loading: false,
  error: null,
  tempEmail: null,
};

export const registerThunk = createAsyncThunk(
  'auth/register',
  async (payload, { rejectWithValue }) => {
    try {
      const res = await registerUser(payload);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Registration failed');
    }
  }
);

export const verifyOtpThunk = createAsyncThunk(
  'auth/verifyOtp',
  async (payload, { rejectWithValue }) => {
    try {
      const res = await verifyOtp(payload);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'OTP verification failed');
    }
  }
);

export const loginThunk = createAsyncThunk(
  'auth/login',
  async (payload, { rejectWithValue }) => {
    try {
      const res = await loginUser(payload);
      return res.data;
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Login failed';
      return rejectWithValue(msg);
    }
  }
);

export const loadUserThunk = createAsyncThunk(
  'auth/loadUser',
  async (_, { rejectWithValue }) => {
    try {
      const res = await getMe();
      return res.data;
    } catch {
      return rejectWithValue('Could not load user');
    }
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setTempEmail: (state, action) => {
      state.tempEmail = action.payload;
    },
    logout: (state) => {
      state.user = null;
      state.token = null;
      state.role = null;
      state.error = null;
      state.tempEmail = null;
      localStorage.removeItem('smp_token');
      localStorage.removeItem('smp_role');
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(registerThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(registerThunk.fulfilled, (state) => {
        state.loading = false;
      })
      .addCase(registerThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      .addCase(verifyOtpThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(verifyOtpThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.token = action.payload.token;
        state.role = action.payload.role;
        state.user = action.payload.user;
        localStorage.setItem('smp_token', action.payload.token);
        localStorage.setItem('smp_role', action.payload.role);
        state.tempEmail = null;
      })
      .addCase(verifyOtpThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      .addCase(loginThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
.addCase(loginThunk.fulfilled, (state, action) => {
  state.loading = false;
  state.token = action.payload.token;
  state.role = action.payload.role || action.payload.user?.role;
  state.user = action.payload.user;
  localStorage.setItem('smp_token', action.payload.token);
  localStorage.setItem('smp_role', state.role);
})
.addCase(loginThunk.rejected, (state, action) => {
  state.loading = false;
  state.error = action.payload;
})

      .addCase(loadUserThunk.fulfilled, (state, action) => {
        state.user = action.payload.user;
        state.role = action.payload.role;
      });
  },
});

export const { setTempEmail, logout, clearError } = authSlice.actions;
export default authSlice.reducer;
