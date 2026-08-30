// src/App.jsx
import { Routes, Route, Navigate } from 'react-router-dom';

import CustomerDashboard from './pages/customer/CustomerDashboard';
import SellerDashboard from './pages/seller/SellerDashboard';
import AdminDashboard from './pages/admin/AdminDashboard';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import VerifyOTP from './pages/auth/VerifyOTP';
import ProtectedRoute from './components/common/ProtectedRoute';
import ManageSellersPage from './pages/admin/ManageSellersPage';
import AdminCategoriesPage from './pages/admin/AdminCategoriesPage';
import CheckoutPage from './pages/customer/CheckoutPage';
import AddressesPage from './pages/customer/AddressesPage';
import MyProductsPage from './pages/seller/MyProductsPage';
import SellerOrdersPage from './pages/seller/SellerOrdersPage';
import HomePage from './pages/customer/HomePage';
import ProductDetailsPage from './pages/customer/ProductDetailsPage';
import CartPage from './pages/customer/CartPage';
import WishlistPage from './pages/customer/WishlistPage';
import OrderDetailsPage from './pages/customer/OrderDetailsPage';
import MyOrdersPage from './pages/customer/MyOrdersPage';
import SellerProductDetailsPage from './pages/seller/SellerProductDetailsPage';
import InventoryLogsPage from './pages/admin/InventoryLogsPage';
import SellerInventoryLogsPage from './pages/seller/InventoryLogsPage';
import ErrorBoundary from './components/common/ErrorBoundary';
import SellerOrderDetailsPage from "./pages/seller/SellerOrderDetailsPage";  // ✅ ADD THIS

// 🔐 load user thunk

function App() {
  // Restoring the user after a refresh now lives in AuthProvider, which does it
  // whenever the token changes and ends the session if the token has expired.

  return (
    <ErrorBoundary>
      <Routes>
        {/* 🏠 DEFAULT - redirect to shop */}
        <Route path="/" element={<Navigate to="/shop" />} />

        {/* 🔓 AUTH ROUTES */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/verify-otp" element={<VerifyOTP />} />

        {/* 🌐 PUBLIC ROUTES */}
        <Route path="/shop" element={<HomePage />} />
        <Route path="/products/:productId" element={<ProductDetailsPage />} />

        {/* 🔒 CUSTOMER */}
        <Route element={<ProtectedRoute allowedRoles={['customer']} />}>
          <Route path="/customer/dashboard" element={<CustomerDashboard />} />
          <Route path="/customer/addresses" element={<AddressesPage />} />
          <Route path="/customer/checkout" element={<CheckoutPage />} />
          <Route path="/customer/orders" element={<MyOrdersPage />} />
          <Route path="/customer/orders/:orderId" element={<OrderDetailsPage />} />
          <Route path="/customer/cart" element={<CartPage />} />
          <Route path="/customer/wishlist" element={<WishlistPage />} />
        </Route>

        {/* 🧾 SELLER */}
        <Route element={<ProtectedRoute allowedRoles={['seller']} />}>
          <Route path="/seller/dashboard" element={<SellerDashboard />} />
          <Route path="/seller/products" element={<MyProductsPage />} />
          <Route path="/seller/orders" element={<SellerOrdersPage />} />
          <Route path="/seller/orders/:orderId" element={<SellerOrderDetailsPage />} />  {/* ✅ ADD THIS */}

          <Route path="/seller/products/:id" element={<SellerProductDetailsPage />} />
          <Route path="/seller/inventory-logs" element={<SellerInventoryLogsPage />} />
        </Route>

        {/* 🛠️ ADMIN */}
        <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/manage-sellers" element={<ManageSellersPage />} />
          <Route path="/admin/categories" element={<AdminCategoriesPage />} />
          <Route path="/admin/inventory-logs" element={<InventoryLogsPage />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
