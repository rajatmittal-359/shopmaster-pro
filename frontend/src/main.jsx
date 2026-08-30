import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import './index.css';
import App from './App';
import { AuthProvider } from './context/AuthProvider';
import { WishlistProvider } from './context/WishlistProvider';
import { ConfirmProvider } from './context/ConfirmProvider';

/**
 * Provider order matters:
 *   AuthProvider     - everything else needs to know who is signed in
 *   WishlistProvider - reads auth, and fetches the wishlist once for the app
 *   ConfirmProvider  - owns the confirmation dialog, outside the router so a
 *                      route change cannot unmount an open dialog
 */
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <WishlistProvider>
        <ConfirmProvider>
          <BrowserRouter>
            <App />

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
        </ConfirmProvider>
      </WishlistProvider>
    </AuthProvider>
  </StrictMode>
);
