'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { authedFetch } from '@/lib/client';
import { useT } from '@/lib/i18n';
import { Switch } from '@/components/ui/switch';
import PanelCard from '@/components/panel/PanelCard';

/**
 * Where each kind of notification also goes (plan 2.30).
 *
 * Reference: Amazon Seller Central's Notification Preferences - a row per
 * category, a column per channel. The bell always gets everything (it is
 * the record); these switches only ever turn a phone push or an email OFF.
 * Saved on each flip, with an Undo-free confirmation - flipping back is the undo.
 */
export default function NotificationPrefs({ title, lead }) {
  const t = useT();
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState('');

  useEffect(() => {
    let cancelled = false;
    authedFetch('/notifications/preferences')
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && toast.error(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  const flip = async (channel, key, value) => {
    const prev = data;
    setSaving(`${channel}.${key}`);
    setData({ ...data, prefs: { ...data.prefs, [channel]: { ...data.prefs[channel], [key]: value } } });
    try {
      const r = await authedFetch('/notifications/preferences', { method: 'PATCH', body: { [channel]: { [key]: value } } });
      setData((d) => ({ ...d, prefs: r.prefs }));
    } catch (e) {
      setData(prev);
      toast.error(e.message);
    } finally {
      setSaving('');
    }
  };

  const labelOf = (c) => t(c.label);
  const hintOf = (c) => t(c.hint);

  return (
    <PanelCard title={title || t('What reaches you where')} lead={lead || t('The bell gets everything. Choose what also comes to your phone or email.')}>
      {!data ? (
        <p className="text-sm text-muted-foreground">{t('Reading…')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="pb-2 font-medium">{t('Kind')}</th>
                <th className="pb-2 text-center font-medium">{t('Phone')}</th>
                <th className="pb-2 text-center font-medium">{t('Email')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.categories.map((c) => (
                <tr key={c.key}>
                  <td className="py-2.5 pr-3">
                    <p className="font-medium">{labelOf(c)}</p>
                    <p className="text-xs text-muted-foreground">{hintOf(c)}</p>
                  </td>
                  {['push', 'email'].map((ch) => (
                    <td key={ch} className="py-2.5 text-center">
                      <Switch
                        checked={data.prefs[ch][c.key] !== false}
                        disabled={saving === `${ch}.${c.key}`}
                        onCheckedChange={(v) => flip(ch, c.key, Boolean(v))}
                        aria-label={`${labelOf(c)} · ${ch === 'push' ? t('Phone') : t('Email')}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PanelCard>
  );
}
