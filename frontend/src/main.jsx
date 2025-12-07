import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { Toaster } from 'react-hot-toast';

import './index.css';
import App from './App';
import store from './redux/store';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider store={store}>
      <BrowserRouter>
        <App />

        {/* ✅ Global Toast System */}
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 2500,
            style: {
              background: '#333',
              color: '#fff',
              fontSize: '14px',
            },
          }}
        />

      </BrowserRouter>
    </Provider>
  </StrictMode>
);
