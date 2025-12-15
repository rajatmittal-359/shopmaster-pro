// frontend/src/components/common/Layout.jsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { logout } from '../../redux/slices/authSlice';
import { FiMenu, FiX } from 'react-icons/fi';

export default function Layout({ children, title = 'Dashboard' }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const { user, role, token } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleLogout = () => {
    dispatch(logout());
    navigate('/login');
  };

  const name = user?.name || 'User';
  const initial = name.charAt(0).toUpperCase();

  return (
    <div className="h-screen flex bg-gray-100">
      {/* SIDEBAR */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-30 w-64 bg-white shadow-lg
          transform transition-transform duration-200
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="h-16 flex items-center justify-between px-4 border-b">
          <span className="font-bold text-xl text-orange-600">
            ShopMaster Pro
          </span>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="text-xl text-gray-600 md:hidden flex items-center justify-center w-8 h-8 rounded hover:bg-gray-100"
          >
            <FiX />
          </button>
        </div>

        {/* LINKS */}
        <nav className="mt-4 px-2 space-y-1 text-sm">
          {/* CUSTOMER LINKS */}
          {role === 'customer' && (
            <>
              <Link
                to="/customer/dashboard"
                onClick={() => setIsSidebarOpen(false)}
                className="flex items-center p-3 rounded-md hover:bg-orange-100 text-gray-700 hover:text-orange-600 transition-all duration-200 block"
              >
                <span className="w-5 mr-3">📊</span>Customer Dashboard
              </Link>
              <Link
                to="/shop"
                onClick={() => setIsSidebarOpen(false)}
                className="flex items-center p-3 rounded-md hover:bg-orange-100 text-gray-700 hover:text-orange-600 transition-all duration-200 block"
              >
                <span className="w-5 mr-3">🛍️</span>Shop
              </Link>
              <Link
                to="/customer/cart"
                onClick={() => setIsSidebarOpen(false)}
                className="flex items-center p-3 rounded-md hover:bg-orange-100 text-gray-700 hover:text-orange-600 transition-all duration-200 block"
              >
                <span className="w-5 mr-3">🛒</span>My Cart
              </Link>
              <Link
                to="/customer/wishlist"
                onClick={() => setIsSidebarOpen(false)}
                className="flex items-center p-3 rounded-md hover:bg-orange-100 text-gray-700 hover:text-orange-600 transition-all duration-200 block"
              >
                <span className="w-5 mr-3">❤️</span>My Wishlist
              </Link>
              <Link
                to="/customer/addresses"
                onClick={() => setIsSidebarOpen(false)}
                className="flex items-center p-3 rounded-md hover:bg-orange-100 text-gray-700 hover:text-orange-600 transition-all duration-200 block"
              >
                <span className="w-5 mr-3">📍</span>My Addresses
              </Link>
              <Link
                to="/customer/orders"
                onClick={() => setIsSidebarOpen(false)}
                className="flex items-center p-3 rounded-md hover:bg-orange-100 text-gray-700 hover:text-orange-600 transition-all duration-200 block"
              >
                <span className="w-5 mr-3">📦</span>My Orders
              </Link>
              <Link
                to="/customer/checkout"
                onClick={() => setIsSidebarOpen(false)}
                className="flex items-center p-3 rounded-md hover:bg-orange-100 text-gray-700 hover:text-orange-600 transition-all duration-200 block"
              >
                <span className="w-5 mr-3">💳</span>Checkout
              </Link>
            </>
          )}

          {/* SELLER LINKS */}
          {role === 'seller' && (
            <>
              <Link
                to="/seller/dashboard"
                onClick={() => setIsSidebarOpen(false)}
                className="flex items-center p-3 rounded-md hover:bg-orange-100 text-gray-700 hover:text-orange-600 transition-all duration-200 block"
              >
                <span className="w-5 mr-3">📊</span>Seller Dashboard
              </Link>
              <Link
                to="/seller/products"
                onClick={() => setIsSidebarOpen(false)}
                className="flex items-center p-3 rounded-md hover:bg-orange-100 text-gray-700 hover:text-orange-600 transition-all duration-200 block"
              >
                <span className="w-5 mr-3">📦</span>My Products
              </Link>
              <Link
                to="/seller/orders"
                onClick={() => setIsSidebarOpen(false)}
                className="flex items-center p-3 rounded-md hover:bg-orange-100 text-gray-700 hover:text-orange-600 transition-all duration-200 block"
              >
                <span className="w-5 mr-3">📋</span>My Orders
              </Link>
              <Link
                to="/seller/inventory-logs"
                onClick={() => setIsSidebarOpen(false)}
                className="flex items-center p-3 rounded-md hover:bg-orange-100 text-gray-700 hover:text-orange-600 transition-all duration-200 block"
              >
                <span className="w-5 mr-3">📊</span>Inventory Logs
              </Link>
            </>
          )}

          {/* ADMIN LINKS */}
          {role === 'admin' && (
            <>
              <Link
                to="/admin/dashboard"
                onClick={() => setIsSidebarOpen(false)}
                className="flex items-center p-3 rounded-md hover:bg-orange-100 text-gray-700 hover:text-orange-600 transition-all duration-200 block"
              >
                <span className="w-5 mr-3">📊</span>Admin Dashboard
              </Link>
              <Link
                to="/admin/manage-sellers"
                onClick={() => setIsSidebarOpen(false)}
                className="flex items-center p-3 rounded-md hover:bg-orange-100 text-gray-700 hover:text-orange-600 transition-all duration-200 block"
              >
                <span className="w-5 mr-3">👥</span>Manage Sellers
              </Link>
              <Link
                to="/admin/categories"
                onClick={() => setIsSidebarOpen(false)}
                className="flex items-center p-3 rounded-md hover:bg-orange-100 text-gray-700 hover:text-orange-600 transition-all duration-200 block"
              >
                <span className="w-5 mr-3">📂</span>Manage Categories
              </Link>
              <Link
                to="/admin/inventory-logs"
                onClick={() => setIsSidebarOpen(false)}
                className="flex items-center p-3 rounded-md hover:bg-orange-100 text-gray-700 hover:text-orange-600 transition-all duration-200 block"
              >
                <span className="w-5 mr-3">📈</span>Inventory Logs
              </Link>
            </>
          )}
        </nav>
      </aside>

      {/* OVERLAY */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* MAIN AREA */}
      <div
        className={`flex-1 flex flex-col transition-all duration-200 ${
          isSidebarOpen ? 'md:ml-64' : 'md:ml-0'
        }`}
      >
        {/* HEADER */}
        <header className="h-16 flex items-center justify-between px-4 bg-white shadow-sm">
          {/* Left: sidebar toggle */}
          <button
            className="text-2xl text-gray-700"
            onClick={() => setIsSidebarOpen((prev) => !prev)}
          >
            {isSidebarOpen ? <FiX /> : <FiMenu />}
          </button>

          {/* Center: title */}
          {role === 'customer' ? (
            <button
              onClick={() => navigate('/shop')}
              className="font-semibold text-lg text-gray-800 hover:text-orange-600"
            >
              {title}
            </button>
          ) : (
            <h1 className="font-semibold text-lg">{title}</h1>
          )}

          {/* Right: auth actions */}
          <div className="flex items-center gap-3">
            {!token ? (
              <>
                <button
                  onClick={() => navigate('/login')}
                  className="px-3 py-1 text-sm border border-orange-500 text-orange-500 rounded hover:bg-orange-50"
                >
                  Login
                </button>
                <button
                  onClick={() => navigate('/register')}
                  className="px-3 py-1 text-sm bg-orange-500 text-white rounded hover:bg-orange-600"
                >
                  Register
                </button>
              </>
            ) : (
              <>
                <div className="hidden sm:flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center text-sm font-semibold">
                    {initial}
                  </div>
                  <span className="text-sm text-gray-700 max-w-[120px] truncate">
                    Hello, {name}
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100"
                >
                  Logout
                </button>
              </>
            )}
          </div>
        </header>

        {/* CONTENT */}
        <main className="flex-1 overflow-y-auto p-4">{children}</main>
      </div>
    </div>
  );
}
