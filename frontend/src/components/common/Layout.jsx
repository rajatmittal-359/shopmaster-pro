import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { logout } from '../../redux/slices/authSlice';
import { FiMenu, FiX, FiShoppingCart, FiHeart } from 'react-icons/fi';

export default function Layout({ children, title = 'Dashboard' }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(
    window.innerWidth >= 768
  );

  const { user, role } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  // ✅ Close sidebar automatically on route change (mobile only)
  useEffect(() => {
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  }, [location.pathname]);

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
        className={`fixed inset-y-0 left-0 z-30 w-64 bg-white shadow-lg
        transform transition-transform duration-200
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="h-16 flex items-center justify-between px-4 border-b">
          <span className="font-bold text-xl text-orange-600">
            ShopMaster Pro
          </span>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="text-xl text-gray-600 md:hidden"
          >
            <FiX />
          </button>
        </div>

        {/* LINKS */}
        <nav className="mt-4 px-2 space-y-1 text-sm">
          {role === 'customer' && (
            <>
              <Link to="/customer/dashboard" className="sidebar-link">📊 Customer Dashboard</Link>
              <Link to="/shop" className="sidebar-link">🛍️ Shop</Link>
              <Link to="/customer/cart" className="sidebar-link">🛒 My Cart</Link>
              <Link to="/customer/wishlist" className="sidebar-link">❤️ My Wishlist</Link>
              <Link to="/customer/addresses" className="sidebar-link">📍 My Addresses</Link>
              <Link to="/customer/orders" className="sidebar-link">📦 My Orders</Link>
              <Link to="/customer/checkout" className="sidebar-link">💳 Checkout</Link>
            </>
          )}

          {role === 'seller' && (
            <>
              <Link to="/seller/dashboard" className="sidebar-link">📊 Seller Dashboard</Link>
              <Link to="/seller/products" className="sidebar-link">📦 My Products</Link>
              <Link to="/seller/orders" className="sidebar-link">📋 My Orders</Link>
              <Link to="/seller/inventory-logs" className="sidebar-link">📈 Inventory Logs</Link>
            </>
          )}

          {role === 'admin' && (
            <>
              <Link to="/admin/dashboard" className="sidebar-link">📊 Admin Dashboard</Link>
              <Link to="/admin/manage-sellers" className="sidebar-link">👥 Manage Sellers</Link>
              <Link to="/admin/categories" className="sidebar-link">📂 Manage Categories</Link>
              <Link to="/admin/inventory-logs" className="sidebar-link">📈 Inventory Logs</Link>
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

      {/* MAIN */}
      <div className={`flex-1 flex flex-col ${isSidebarOpen ? 'md:ml-64' : ''}`}>
        <header className="h-16 flex items-center justify-between px-4 bg-white shadow-sm">
          <button onClick={() => setIsSidebarOpen((p) => !p)} className="text-2xl">
            {isSidebarOpen ? <FiX /> : <FiMenu />}
          </button>

          <h1 className="font-semibold text-lg">{title}</h1>

          {/* AUTH AREA */}
          <div className="flex items-center gap-3">
            {user ? (
              <>
                {role === 'customer' && (
                  <>
                    <button onClick={() => navigate('/customer/cart')}>
                      <FiShoppingCart />
                    </button>
                    <button onClick={() => navigate('/customer/wishlist')}>
                      <FiHeart />
                    </button>
                  </>
                )}
                <button onClick={handleLogout} className="text-sm text-red-600">
                  Logout
                </button>
                <div className="w-9 h-9 rounded-full bg-orange-500 text-white flex items-center justify-center">
                  {initial}
                </div>
              </>
            ) : (
              <button
                onClick={() => navigate('/login')}
                className="text-sm font-medium text-orange-600"
              >
                Login / Signup
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4">{children}</main>
      </div>
    </div>
  );
}
