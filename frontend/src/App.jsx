import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import ProtectedRoute from './components/common/ProtectedRoute';
import ErrorBoundary from './components/common/ErrorBoundary';

/**
 * Pages are loaded per route, not all at once.
 *
 * WHY
 *   Everything used to ship in one 898 KB bundle, so a shopper who only ever
 *   browses jewellery still downloaded the seller dashboard, the admin
 *   dashboard, and recharts - a charting library used by exactly one admin
 *   page. That is bytes a customer pays for on a phone and can never use, and
 *   it counts against the page-speed signals Google measures.
 *
 * WHAT STAYS EAGER
 *   The shop, the product page and the auth screens: these are the first thing
 *   a visitor sees, and splitting them would trade a smaller bundle for a
 *   loading flash on the most important pages.
 */

// First impressions - kept in the main bundle deliberately.
import HomePage from './pages/customer/HomePage';
import ProductDetailsPage from './pages/customer/ProductDetailsPage';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import VerifyOTP from './pages/auth/VerifyOTP';

// Signed-in customer areas.
const CustomerDashboard = lazy(() => import('./pages/customer/CustomerDashboard'));
const AddressesPage = lazy(() => import('./pages/customer/AddressesPage'));
const CheckoutPage = lazy(() => import('./pages/customer/CheckoutPage'));
const MyOrdersPage = lazy(() => import('./pages/customer/MyOrdersPage'));
const OrderDetailsPage = lazy(() => import('./pages/customer/OrderDetailsPage'));
const CartPage = lazy(() => import('./pages/customer/CartPage'));
const WishlistPage = lazy(() => import('./pages/customer/WishlistPage'));

// Seller dashboard - never opened by a shopper.
const SellerDashboard = lazy(() => import('./pages/seller/SellerDashboard'));
const MyProductsPage = lazy(() => import('./pages/seller/MyProductsPage'));
const SellerOrdersPage = lazy(() => import('./pages/seller/SellerOrdersPage'));
const SellerOrderDetailsPage = lazy(() => import('./pages/seller/SellerOrderDetailsPage'));
const SellerProductDetailsPage = lazy(() => import('./pages/seller/SellerProductDetailsPage'));
const SellerInventoryLogsPage = lazy(() => import('./pages/seller/InventoryLogsPage'));

// Admin - the smallest audience and the heaviest page (recharts).
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const ManageSellersPage = lazy(() => import('./pages/admin/ManageSellersPage'));
const AdminCategoriesPage = lazy(() => import('./pages/admin/AdminCategoriesPage'));
const InventoryLogsPage = lazy(() => import('./pages/admin/InventoryLogsPage'));

/** Shown for the moment a lazily loaded page is being fetched. */
function PageLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <p className="text-sm text-gray-500">Loading…</p>
    </div>
  );
}

function App() {
  // Restoring the user after a refresh lives in AuthProvider, which does it
  // whenever the token changes and ends the session if the token has expired.

  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route path="/" element={<Navigate to="/shop" />} />

          {/* Auth */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify-otp" element={<VerifyOTP />} />

          {/* Public */}
          <Route path="/shop" element={<HomePage />} />
          <Route path="/products/:productId" element={<ProductDetailsPage />} />

          {/* Customer */}
          <Route element={<ProtectedRoute allowedRoles={['customer']} />}>
            <Route path="/customer/dashboard" element={<CustomerDashboard />} />
            <Route path="/customer/addresses" element={<AddressesPage />} />
            <Route path="/customer/checkout" element={<CheckoutPage />} />
            <Route path="/customer/orders" element={<MyOrdersPage />} />
            <Route path="/customer/orders/:orderId" element={<OrderDetailsPage />} />
            <Route path="/customer/cart" element={<CartPage />} />
            <Route path="/customer/wishlist" element={<WishlistPage />} />
          </Route>

          {/* Seller */}
          <Route element={<ProtectedRoute allowedRoles={['seller']} />}>
            <Route path="/seller/dashboard" element={<SellerDashboard />} />
            <Route path="/seller/products" element={<MyProductsPage />} />
            <Route path="/seller/products/:id" element={<SellerProductDetailsPage />} />
            <Route path="/seller/orders" element={<SellerOrdersPage />} />
            <Route path="/seller/orders/:orderId" element={<SellerOrderDetailsPage />} />
            <Route path="/seller/inventory-logs" element={<SellerInventoryLogsPage />} />
          </Route>

          {/* Admin */}
          <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/manage-sellers" element={<ManageSellersPage />} />
            <Route path="/admin/categories" element={<AdminCategoriesPage />} />
            <Route path="/admin/inventory-logs" element={<InventoryLogsPage />} />
          </Route>
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default App;
