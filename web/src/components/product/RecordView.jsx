'use client';

import { useEffect } from 'react';
import { recordView } from '@/lib/recentlyViewed';

/** Renders nothing; notes that this product was opened (lib/recentlyViewed). */
export default function RecordView({ id }) {
  useEffect(() => { recordView(id); }, [id]);
  return null;
}
