'use client';

import { useEffect } from 'react';
import { search } from '@/lib/analytics';

/** GA4 `search` for the shop's results page - what people looked for, found or not. */
export default function TrackSearch({ term, results }) {
  useEffect(() => {
    if (term) search(term, results);
  }, [term, results]);
  return null;
}
