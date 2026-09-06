import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LogOut } from 'lucide-react';

/**
 * The avatar, and what is behind it.
 *
 * WHY THIS EXISTS
 *   The avatar was a <div>. It could not be clicked, tabbed to, or read out;
 *   it carried a `title` and nothing else. Every shop puts the account behind
 *   that circle, so people click it - and here nothing happened.
 *
 *   The first job of an avatar is not navigation, it is ANSWERING "who am I
 *   signed in as". On a marketplace where the same person has a customer login
 *   and a seller login, and where this project's own owner is both, that is a
 *   real question with a wrong answer available. So the menu opens with the
 *   name, the email and the role, before any link.
 *
 *   Sign out lives here too. It was only at the foot of the sidebar, which on a
 *   phone is behind the menu button - two taps and a scroll from anywhere.
 */
export default function AccountMenu({ name, email, role, initial, onSignOut }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const button = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      // Focus goes back where it came from, or a keyboard user is dropped at
      // the top of the document with no idea where they were.
      button.current?.focus();
    };
    const onPointerDown = (e) => {
      if (!wrap.current?.contains(e.target)) setOpen(false);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  // Where "my account" means something different for each role.
  const links =
    role === 'customer'
      ? [
          ['My orders', '/customer/orders'],
          ['My wishlist', '/customer/wishlist'],
          ['My addresses', '/customer/addresses'],
        ]
      : role === 'seller'
        ? [
            ['My products', '/seller/products'],
            ['My orders', '/seller/orders'],
            ['Earnings', '/seller/earnings'],
          ]
        : [
            ['Sellers', '/admin/sellers'],
            ['Categories', '/admin/categories'],
            ['Payouts', '/admin/payouts'],
          ];

  return (
    <div className="relative shrink-0" ref={wrap}>
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${name}`}
        className="w-9 h-9 rounded-full bg-brand-fill text-on-brand text-sm font-medium
                   flex items-center justify-center
                   hover:bg-brand-fill-hover
                   focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
                   focus-visible:outline-brand-fill"
      >
        {initial}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-11 z-40 w-60 rounded-xl border border-gray-200
                     bg-white shadow-lg overflow-hidden"
        >
          {/* Identity first. This is the question the avatar is asked. */}
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="font-medium text-gray-900 truncate">{name}</p>
            {email && (
              <p className="text-xs text-gray-500 truncate mt-0.5">{email}</p>
            )}
            {/* capitalize on the whole line read "Signed In As Customer". */}
            <p className="text-xs text-gray-500 mt-1">
              Signed in as <span className="capitalize">{role}</span>
            </p>
          </div>

          <div className="py-1">
            {links.map(([label, to]) => (
              <Link
                key={to}
                to={to}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50
                           focus-visible:outline focus-visible:outline-2
                           focus-visible:-outline-offset-2 focus-visible:outline-brand-fill"
              >
                {label}
              </Link>
            ))}
          </div>

          <div className="py-1 border-t border-gray-100">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700
                         hover:bg-gray-50
                         focus-visible:outline focus-visible:outline-2
                         focus-visible:-outline-offset-2 focus-visible:outline-brand-fill"
            >
              <LogOut size={15} />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
