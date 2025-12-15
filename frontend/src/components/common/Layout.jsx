import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { logout } from '../../redux/slices/authSlice';
// Layout.jsx ke top pe:
import { FiMenu, FiX, FiShoppingCart, FiHeart } from 'react-icons/fi';

export default function Layout({ children, title = 'Dashboard' }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const { user, role } = useSelector((state) => state.auth);
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
      {/* ✅ SIDEBAR */}
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

        {/* ✅ LINKS */}
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
      <Link to="/shop" onClick={() => setIsSidebarOpen(false)} className="flex items-center p-3 rounded-md hover:bg-orange-100 text-gray-700 hover:text-orange-600 transition-all duration-200 block">
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

      {/* ✅ OVERLAY */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* ✅ MAIN AREA */}
      <div
        className={`flex-1 flex flex-col transition-all duration-200 ${
          isSidebarOpen ? 'md:ml-64' : 'md:ml-0'
        }`}
      >
        
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

  {/* Right: compact action bar */}
  <div className="flex items-center gap-4">
    {role === 'customer' && (
      <div className="flex items-center gap-3 px-3 py-1 rounded-full border border-gray-200 bg-gray-50">
        <button
          onClick={() => navigate('/customer/cart')}
          className="text-gray-700 hover:text-orange-600 transition-colors"
        >
          <FiShoppingCart className="w-5 h-5" />
        </button>
        <span className="w-px h-4 bg-gray-300" />
        <button
          onClick={() => navigate('/customer/wishlist')}
          className="text-gray-700 hover:text-pink-600 transition-colors"
        >
          <FiHeart className="w-4 h-4" />
        </button>
      </div>
    )}

    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-600 hidden sm:inline">
        Hello, {name}
      </span>
      <button
        onClick={handleLogout}
        className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full bg-gray-100 text-gray-700 hover:bg-red-50 hover:text-red-600 border border-transparent hover:border-red-200 transition-colors"
      >
        Logout
      </button>
      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-500 to-red-500 text-white flex items-center justify-center text-sm font-semibold shadow-sm">
        {initial}
      </div>
    </div>
  </div>
</header>

        <main className="flex-1 overflow-y-auto p-4">{children}</main>
      </div>
    </div>
  );
}
