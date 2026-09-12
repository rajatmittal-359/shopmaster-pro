'use client';

import { useEffect } from 'react';
import { viewItem } from '@/lib/analytics';

/** Sends GA4's view_item once for the product page it sits on. Renders nothing. */
export default function TrackView({ product }) {
  useEffect(() => {
    if (product?._id) viewItem(product, product.price);
  }, [product]);
  return null;
}
