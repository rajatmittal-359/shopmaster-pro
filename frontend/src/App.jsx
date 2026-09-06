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
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';

/*
 * Policy pages. Eagerly imported, not lazy: Razorpay's website check and
 * Google's crawler fetch these directly, and a route that resolves to a
 * loading spinner reads to a checker as a page with no policy on it.
 */
import ContactPage from './pages/policy/ContactPage';
import ShippingPolicyPage from './pages/policy/ShippingPolicyPage';
import RefundPolicyPage from './pages/policy/RefundPolicyPage';
import PricingPage from './pages/policy/PricingPage';
import TermsPage from './pages/policy/TermsPage';
import PrivacyPage from './pages/policy/PrivacyPage';

// Signed-in customer areas.
const AddressesPage = lazy(() => import('./pages/customer/AddressesPage'));
const CheckoutPage = lazy(() => import('./pages/customer/CheckoutPage'));
const MyOrdersPage = lazy(() => import('./pages/customer/MyOrdersPage'));
const OrderDetailsPage = lazy(() => import('./pages/customer/OrderDetailsPage'));
const OrderBillPage = lazy(() => import('./pages/customer/OrderBillPage'));
const CartPage = lazy(() => import('./pages/customer/CartPage'));
const WishlistPage = lazy(() => import('./pages/customer/WishlistPage'));

// Seller dashboard - never opened by a shopper.
const SellerDashboard = lazy(() => import('./pages/seller/SellerDashboard'));
const MyProductsPage = lazy(() => import('./pages/seller/MyProductsPage'));
const SellerOrdersPage = lazy(() => import('./pages/seller/SellerOrdersPage'));
const SellerOrderDetailsPage = lazy(() => import('./pages/seller/SellerOrderDetailsPage'));
const SellerProductDetailsPage = lazy(() => import('./pages/seller/SellerProductDetailsPage'));
const SellerInventoryLogsPage = lazy(() => import('./pages/seller/InventoryLogsPage'));
const EarningsPage = lazy(() => import('./pages/seller/EarningsPage'));
const SellerSettingsPage = lazy(() => import('./pages/seller/SellerSettingsPage'));

// Admin - the smallest audience and the heaviest page (recharts).
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const ManageSellersPage = lazy(() => import('./pages/admin/ManageSellersPage'));
const AdminCategoriesPage = lazy(() => import('./pages/admin/AdminCategoriesPage'));
const AdminOrdersPage = lazy(() => import('./pages/admin/AdminOrdersPage'));
const InventoryLogsPage = lazy(() => import('./pages/admin/InventoryLogsPage'));
const PayoutsPage = lazy(() => import('./pages/admin/PayoutsPage'));

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

          {/* Public by definition - the whole point is being unable to sign in. */}
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Public, and indexable on purpose - a checker that cannot read
              the page counts the policy as missing. */}
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/shipping-policy" element={<ShippingPolicyPage />} />
          <Route path="/refund-policy" element={<RefundPolicyPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />

          {/* Public */}
          <Route path="/shop" element={<HomePage />} />
          <Route path="/products/:productId" element={<ProductDetailsPage />} />

          {/* Customer */}
          <Route element={<ProtectedRoute allowedRoles={['customer']} />}>
            {/*
              A shop has no customer dashboard. The page counted orders,
              active orders and cart items - which is My Orders, and the cart
              badge, said a second time. Old links still resolve.
            */}
            <Route
              path="/customer/dashboard"
              element={<Navigate to="/customer/orders" replace />}
            />
            <Route path="/customer/addresses" element={<AddressesPage />} />
            <Route path="/customer/checkout" element={<CheckoutPage />} />
            <Route path="/customer/orders" element={<MyOrdersPage />} />
            <Route path="/customer/orders/:orderId" element={<OrderDetailsPage />} />
            <Route path="/customer/orders/:orderId/bill" element={<OrderBillPage />} />
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
            <Route path="/seller/earnings" element={<EarningsPage />} />
            <Route path="/seller/settings" element={<SellerSettingsPage />} />
          </Route>

          {/* Admin */}
          <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/manage-sellers" element={<ManageSellersPage />} />
            <Route path="/admin/categories" element={<AdminCategoriesPage />} />
            <Route path="/admin/orders" element={<AdminOrdersPage />} />
            <Route path="/admin/inventory-logs" element={<InventoryLogsPage />} />
            <Route path="/admin/payouts" element={<PayoutsPage />} />
          </Route>
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default App;
