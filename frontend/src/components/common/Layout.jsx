import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/authContext';
import { useConfirm } from '../../context/confirmContext';
import { FiMenu, FiX, FiShoppingCart, FiHeart } from 'react-icons/fi';
import {
  Store,
  Package,
  Heart,
  MapPin,
  LayoutDashboard,
  ClipboardList,
  Wallet,
  LineChart,
  Users,
  FolderTree,
  Settings,
  Ticket,
  LogOut,
} from 'lucide-react';
import { useCart } from '../../context/cartContext';
import AccountMenu from './AccountMenu';
import { POLICY_PAGES } from '../../config/policy';

export default function Layout({ children, title = 'Dashboard' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, role, isLoggedIn, logout } = useAuth();
  const confirm = useConfirm();
  const { count: cartCount } = useCart();

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
            {/* The app's own name - the second and last place a gradient
                is allowed. See index.css. */}
            <span className="brand-mark font-bold text-xl tracking-tight">
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
            {/*
              A shop has no "customer dashboard" - that is a seller and admin
              idea. The one that was here counted orders, active orders and
              cart items, which is My Orders and the cart badge said twice.

              "Checkout" is gone too: it is a step inside the cart, not a
              destination, and with an empty cart it led nowhere. The cart
              itself lives in the header, where its count is visible.
            */}
            {role === 'customer' && (
              <>
                <SidebarLink to="/shop" icon={<Store size={18} />} text="Shop" />
                <SidebarLink to="/customer/orders" icon={<Package size={18} />} text="My orders" />
                <SidebarLink to="/customer/wishlist" icon={<Heart size={18} />} text="My wishlist" />
                <SidebarLink to="/customer/addresses" icon={<MapPin size={18} />} text="My addresses" />
              </>
            )}

            {/* SELLER */}
            {role === 'seller' && (
              <>
                <SidebarLink to="/seller/dashboard" icon={<LayoutDashboard size={18} />} text="Dashboard" />
                <SidebarLink to="/seller/products" icon={<Package size={18} />} text="My products" />
                <SidebarLink to="/seller/orders" icon={<ClipboardList size={18} />} text="My orders" />
                <SidebarLink to="/seller/earnings" icon={<Wallet size={18} />} text="Earnings" />
                <SidebarLink to="/seller/inventory-logs" icon={<LineChart size={18} />} text="Inventory logs" />
                <SidebarLink to="/seller/settings" icon={<Settings size={18} />} text="Settings" />
              </>
            )}

            {/* ADMIN */}
            {role === 'admin' && (
              <>
                <SidebarLink to="/admin/dashboard" icon={<LayoutDashboard size={18} />} text="Dashboard" />
                <SidebarLink to="/admin/orders" icon={<ClipboardList size={18} />} text="Orders" />
                <SidebarLink to="/admin/manage-sellers" icon={<Users size={18} />} text="Sellers" />
                <SidebarLink to="/admin/categories" icon={<FolderTree size={18} />} text="Categories" />
                <SidebarLink to="/admin/payouts" icon={<Wallet size={18} />} text="Payouts" />
                <SidebarLink to="/admin/coupons" icon={<Ticket size={18} />} text="Coupons" />
                <SidebarLink to="/admin/inventory-logs" icon={<LineChart size={18} />} text="Inventory logs" />
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
                         focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-700"
            >
              <LogOut size={18} className="shrink-0" aria-hidden="true" />
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
            className="text-2xl text-gray-700 shrink-0 p-1 rounded-lg
                       focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-700"
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
                    aria-label={
                      cartCount > 0 ? `My cart, ${cartCount} item(s)` : 'My cart'
                    }
                    className="relative p-2 rounded-lg text-xl text-gray-700 hover:text-brand-ink hover:bg-brand-50
                               focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-700"
                  >
                    <FiShoppingCart />
                    {cartCount > 0 && (
                      <span
                        className="absolute -top-0.5 -right-0.5 min-w-4.5 h-4.5 px-1 rounded-full
                                   bg-brand-fill text-on-brand text-[11px] font-medium leading-none
                                   flex items-center justify-center"
                      >
                        {cartCount > 9 ? '9+' : cartCount}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => navigate('/customer/wishlist')}
                    aria-label="My wishlist"
                    className="p-2 rounded-lg text-xl text-gray-700 hover:text-brand-ink hover:bg-brand-50
                               focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-700"
                  >
                    <FiHeart />
                  </button>
                </>
              )}
              <AccountMenu
                name={name}
                email={user?.email}
                role={role}
                initial={initial}
                onSignOut={handleLogout}
              />
            </div>
          ) : (
            <button
              onClick={() => navigate('/login')}
              className="shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium text-brand-ink
                         border border-brand-200 hover:bg-brand-50
                         focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-700"
            >
              Log in
            </button>
          )}
        </header>

        <main className="flex-1 overflow-y-auto p-4">
          {children}

          {/*
            The policy links.

            They live inside the scrolling area rather than pinned below it, so
            they sit at the END of the page the way a footer should - a bar
            fixed above the fold would take room from the shop on a phone for
            links almost nobody clicks.

            They are not decoration: Razorpay's website check and Google
            Merchant Center both look for these pages, and an unlinked page is
            one they cannot find.
          */}
          <footer className="mt-10 pt-5 border-t border-gray-200">
            <nav className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-500">
              {POLICY_PAGES.map(([label, to]) => (
                <Link key={to} to={to} className="hover:text-brand-ink">
                  {label}
                </Link>
              ))}
            </nav>
            <p className="mt-3 text-xs text-gray-400">
              © {new Date().getFullYear()} Charming Jewels · Jaipur, Rajasthan
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
}

/* ================= Sidebar Link Component ================= */
/**
 * Emoji used to stand in for icons here. They render differently on every
 * operating system, sit on the text baseline rather than aligning with it, and
 * cannot take the colour of the row they are in.
 */
function SidebarLink({ to, icon, text }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 p-3 rounded-md hover:bg-brand-50
                 text-gray-700 hover:text-brand-ink transition-colors
                 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-700"
    >
      <span className="shrink-0" aria-hidden="true">
        {icon}
      </span>
      {text}
    </Link>
  );
}
