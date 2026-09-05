import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/authContext';
import { useConfirm } from '../../context/confirmContext';
import { FiMenu, FiX, FiShoppingCart, FiHeart } from 'react-icons/fi';

export default function Layout({ children, title = 'Dashboard' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, role, isLoggedIn, logout } = useAuth();
  const confirm = useConfirm();

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

  const handleLogout = async () => {
    const sure = await confirm({
      title: 'Sign out?',
      message: 'Anything in your cart stays saved for next time.',
      confirmLabel: 'Sign out',
      cancelLabel: 'Stay signed in',
      danger: false,
    });
    if (!sure) return;

    logout();
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
                <SidebarLink to="/seller/earnings" icon="💰" text="Earnings" />
                <SidebarLink to="/seller/inventory-logs" icon="📈" text="Inventory Logs" />
              </>
            )}

            {/* ADMIN */}
            {role === 'admin' && (
              <>
                <SidebarLink to="/admin/dashboard" icon="📊" text="Admin Dashboard" />
                <SidebarLink to="/admin/manage-sellers" icon="👥" text="Manage Sellers" />
                <SidebarLink to="/admin/categories" icon="📂" text="Manage Categories" />
                <SidebarLink to="/admin/payouts" icon="💰" text="Payouts" />
                <SidebarLink to="/admin/inventory-logs" icon="📈" text="Inventory Logs" />
              </>
            )}
          </nav>

          {/*
            Signing out is a rare, deliberate act. It sat in the header in
            extrabold red, where it was the most prominent control on a shop.
          */}
          <div className="absolute bottom-0 inset-x-0 border-t border-gray-100 p-2">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 p-3 rounded-md text-sm text-gray-600
                         hover:bg-red-50 hover:text-red-700 transition-colors
                         focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-600"
            >
              <span className="w-5 mr-0" aria-hidden="true">↪</span>
              Sign out
            </button>
          </div>
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
      {/*
        min-w-0 is load-bearing. A flex item's minimum width defaults to its
        content, so without it this column refused to shrink below whatever the
        widest thing inside it wanted - and the whole page scrolled sideways on
        a phone, cutting the right edge off every product card.
      */}
      <div
        className={`flex-1 min-w-0 flex flex-col transition-all duration-200 ${
          isLoggedIn && isSidebarOpen ? 'md:ml-64' : 'md:ml-0'
        }`}
      >
        {/*
          HEADER, sized for the smallest screen first.

          At 390px the old one overflowed and pushed the cart and wishlist
          icons clean off the screen, so a shopper on a phone - which is where
          nearly all of them are - had no way to reach their own basket. What
          was left was a hamburger, the page title, and "Logout" set in
          extrabold red: the loudest thing on a shopping site was the way out
          of it.

          Logout now lives at the bottom of the sidebar, where a rare action
          belongs. The cart is what stays in the header.
        */}
        <header className="h-14 md:h-16 flex items-center gap-2 px-3 md:px-4 bg-white border-b border-gray-200">
          <button
            className="text-2xl text-gray-700 shrink-0 p-1 rounded
                       focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-600"
            aria-label={isSidebarOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setIsSidebarOpen((p) => !p)}
          >
            {isSidebarOpen ? <FiX /> : <FiMenu />}
          </button>

          {/* Truncates rather than wrapping: a long product name used to push
              the header to two lines and shove everything else out. */}
          <h1 className="font-semibold text-base md:text-lg truncate flex-1 min-w-0">
            {title}
          </h1>

          {isLoggedIn ? (
            <div className="flex items-center gap-1 md:gap-3 shrink-0">
              {role === 'customer' && (
                <>
                  <button
                    onClick={() => navigate('/customer/cart')}
                    aria-label="My cart"
                    className="p-2 rounded text-xl text-gray-700 hover:text-orange-600 hover:bg-orange-50
                               focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-600"
                  >
                    <FiShoppingCart />
                  </button>
                  <button
                    onClick={() => navigate('/customer/wishlist')}
                    aria-label="My wishlist"
                    className="p-2 rounded text-xl text-gray-700 hover:text-orange-600 hover:bg-orange-50
                               focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-600"
                  >
                    <FiHeart />
                  </button>
                </>
              )}
              <div
                className="w-9 h-9 rounded-full bg-orange-500 text-white text-sm font-medium
                           flex items-center justify-center shrink-0"
                title={name}
              >
                {initial}
              </div>
            </div>
          ) : (
            <button
              onClick={() => navigate('/login')}
              className="shrink-0 px-3 py-1.5 rounded text-sm font-medium text-orange-700
                         border border-orange-200 hover:bg-orange-50
                         focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-600"
            >
              Log in
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
