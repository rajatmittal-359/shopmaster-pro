import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiMenu, FiX } from 'react-icons/fi';
import { useDispatch, useSelector } from 'react-redux';
import { logout } from '../../redux/slices/authSlice';

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
          {role === 'customer' && (
            <>
              <Link to="/customer/dashboard" className="block px-3 py-2 rounded-md hover:bg-orange-100">Customer Dashboard</Link>
              <Link to="/customer/shop" className="block px-3 py-2 rounded-md hover:bg-orange-100">Shop</Link>
              <Link to="/customer/cart" className="block px-3 py-2 rounded-md hover:bg-orange-100">My Cart</Link>
              <Link to="/customer/wishlist" className="block px-3 py-2 rounded-md hover:bg-orange-100">My Wishlist</Link>
              <Link to="/customer/addresses" className="block px-3 py-2 rounded-md hover:bg-orange-100">My Addresses</Link>
              <Link to="/customer/orders" className="block px-3 py-2 rounded-md hover:bg-orange-100">My Orders</Link>
              <Link to="/customer/checkout" className="block px-3 py-2 rounded-md hover:bg-orange-100">Checkout</Link>
            </>
          )}

          {role === 'seller' && (
            <>
              <Link to="/seller/dashboard" className="block px-3 py-2 rounded-md hover:bg-orange-100">Seller Dashboard</Link>
              <Link to="/seller/products" className="block px-3 py-2 rounded-md hover:bg-orange-100">My Products</Link>
              <Link to="/seller/orders" className="block px-3 py-2 rounded-md hover:bg-orange-100">My Orders</Link>

              {/* ✅ NEW INVENTORY LOGS LINK */}
              <Link
                to="/seller/inventory-logs"
                className="block px-3 py-2 rounded-md hover:bg-orange-100"
              >
                Inventory Logs
              </Link>
            </>
          )}

          {role === 'admin' && (
            <>
              <Link to="/admin/dashboard" className="block px-3 py-2 rounded-md hover:bg-orange-100">Admin Dashboard</Link>
              <Link to="/admin/manage-sellers" className="block px-3 py-2 rounded-md hover:bg-orange-100">Manage Sellers</Link>
              <Link to="/admin/categories" className="block px-3 py-2 rounded-md hover:bg-orange-100">Manage Categories</Link>

              {/* ✅ NEW INVENTORY LOGS LINK */}
              <Link
                to="/admin/inventory-logs"
                className="block px-3 py-2 rounded-md hover:bg-orange-100"
              >
                Inventory Logs
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
        {/* ✅ HEADER */}
        <header className="h-16 flex items-center justify-between px-4 bg-white shadow-sm">
          <button
            className="text-2xl text-gray-700"
            onClick={() => setIsSidebarOpen((prev) => !prev)}
          >
            {isSidebarOpen ? <FiX /> : <FiMenu />}
          </button>

          <h1 className="font-semibold text-lg">{title}</h1>

          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">Hello, {name}</span>
            <button
              onClick={handleLogout}
              className="text-xs px-3 py-1 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700"
            >
              Logout
            </button>
            <div className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center text-xs">
              {initial}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4">{children}</main>
      </div>
    </div>
  );
}
