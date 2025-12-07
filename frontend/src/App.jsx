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
import WishlistPage from "./pages/customer/WishlistPage";
import OrderDetailsPage from "./pages/customer/OrderDetailsPage";
import MyOrdersPage from './pages/customer/MyOrdersPage';

// ✅ NEW IMPORTS
import InventoryLogsPage from './pages/admin/InventoryLogsPage';
import SellerInventoryLogsPage from './pages/seller/InventoryLogsPage';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/verify-otp" element={<VerifyOTP />} />

      {/* ✅ Customer */}
      <Route element={<ProtectedRoute allowedRoles={['customer']} />}>
        <Route path="/customer/dashboard" element={<CustomerDashboard />} />
        <Route path="/customer/shop" element={<HomePage />} />
        <Route path="/customer/products/:productId" element={<ProductDetailsPage />} />
        <Route path="/customer/addresses" element={<AddressesPage />} />
        <Route path="/customer/checkout" element={<CheckoutPage />} />
        <Route path="/customer/orders" element={<MyOrdersPage />} />
        <Route path="/customer/orders/:orderId" element={<OrderDetailsPage />} />
        <Route path="/customer/cart" element={<CartPage />} />
        <Route path="/customer/wishlist" element={<WishlistPage />} />
      </Route>

      {/* ✅ Seller */}
      <Route element={<ProtectedRoute allowedRoles={['seller']} />}>
        <Route path="/seller/dashboard" element={<SellerDashboard />} />
        <Route path="/seller/products" element={<MyProductsPage />} />
        <Route path="/seller/orders" element={<SellerOrdersPage />} />

        {/* ✅ NEW SELLER INVENTORY LOGS */}
        <Route path="/seller/inventory-logs" element={<SellerInventoryLogsPage />} />
      </Route>

      {/* ✅ Admin */}
      <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/admin/manage-sellers" element={<ManageSellersPage />} />
        <Route path="/admin/categories" element={<AdminCategoriesPage />} />

        {/* ✅ NEW ADMIN INVENTORY LOGS */}
        <Route path="/admin/inventory-logs" element={<InventoryLogsPage />} />
      </Route>
    </Routes>
  );
}

export default App;
