import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { logout } from '../../redux/slices/authSlice';
import { FiMenu, FiX, FiShoppingCart, FiHeart } from 'react-icons/fi';

export default function Layout({ children, title = 'Dashboard' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();

  const { user, role } = useSelector((state) => state.auth);
  const isLoggedIn = Boolean(user && role);

  // ✅ Desktop open, Mobile closed
  const [isSidebarOpen, setIsSidebarOpen] = useState(
    window.innerWidth >= 768
  );

  // ✅ Auto close sidebar on route change (mobile)
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
      {/* ================= SIDEBAR ================= */}
      {isLoggedIn && (
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

          <nav className="mt-4 px-2 space-y-1 text-sm">
            {/* CUSTOMER */}
            {role === 'customer' && (
              <>
                <SidebarLink to="/customer/dashboard" icon="📊" text="Customer Dashboard" />
                <SidebarLink to="/shop" icon="🛍️" text="Shop" />
                <SidebarLink to="/customer/cart" icon="🛒" text="My Cart" />
                <SidebarLink to="/customer/wishlist" icon="❤️" text="My Wishlist" />
                <SidebarLink to="/customer/addresses" icon="📍" text="My Addresses" />
                <SidebarLink to="/customer/orders" icon="📦" text="My Orders" />
                <SidebarLink to="/customer/checkout" icon="💳" text="Checkout" />
              </>
            )}

            {/* SELLER */}
            {role === 'seller' && (
              <>
                <SidebarLink to="/seller/dashboard" icon="📊" text="Seller Dashboard" />
                <SidebarLink to="/seller/products" icon="📦" text="My Products" />
                <SidebarLink to="/seller/orders" icon="📋" text="My Orders" />
                <SidebarLink to="/seller/inventory-logs" icon="📈" text="Inventory Logs" />
              </>
            )}

            {/* ADMIN */}
            {role === 'admin' && (
              <>
                <SidebarLink to="/admin/dashboard" icon="📊" text="Admin Dashboard" />
                <SidebarLink to="/admin/manage-sellers" icon="👥" text="Manage Sellers" />
                <SidebarLink to="/admin/categories" icon="📂" text="Manage Categories" />
                <SidebarLink to="/admin/inventory-logs" icon="📈" text="Inventory Logs" />
              </>
            )}
          </nav>
        </aside>
      )}

      {/* ================= OVERLAY (mobile) ================= */}
      {isSidebarOpen && isLoggedIn && (
        <div
          className="fixed inset-0 bg-black/40 z-20 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* ================= MAIN ================= */}
      <div
        className={`flex-1 flex flex-col transition-all duration-200 ${
          isLoggedIn && isSidebarOpen ? 'md:ml-64' : 'md:ml-0'
        }`}
      >
        <header className="h-16 flex items-center justify-between px-4 bg-white shadow-sm">
          <button
            className="text-2xl text-gray-700"
            onClick={() => setIsSidebarOpen((p) => !p)}
          >
            {isSidebarOpen ? <FiX /> : <FiMenu />}
          </button>

          <h1 className="font-semibold text-lg">{title}</h1>

          {isLoggedIn ? (
            <div className="flex items-center gap-3">
              {role === 'customer' && (
                <>
                  <FiShoppingCart
                    onClick={() => navigate('/customer/cart')}
                    className="cursor-pointer"
                  />
                  <FiHeart
                    onClick={() => navigate('/customer/wishlist')}
                    className="cursor-pointer"
                  />
                </>
              )}
              <button onClick={handleLogout} className="text-sm text-red-600">
                Logout
              </button>
              <div className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center">
                {initial}
              </div>
            </div>
          ) : (
            <button
              onClick={() => navigate('/login')}
              className="text-sm text-orange-600"
            >
              Login
            </button>
          )}
        </header>

        <main className="flex-1 overflow-y-auto p-4">{children}</main>
      </div>
    </div>
  );
}

/* ================= Sidebar Link Component ================= */
function SidebarLink({ to, icon, text }) {
  return (
    <Link
      to={to}
      className="flex items-center p-3 rounded-md hover:bg-orange-100
                 text-gray-700 hover:text-orange-600 transition-all duration-200 block"
    >
      <span className="w-5 mr-3">{icon}</span>
      {text}
    </Link>
  );
}
