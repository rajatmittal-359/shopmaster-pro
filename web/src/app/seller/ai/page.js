import { redirect } from 'next/navigation';

// Moved on 12 Sep 2026 (plan §4.27). Old bookmarks and links land in the right place.
export default function Moved() {
  redirect('/seller/products/studio');
}
