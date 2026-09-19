'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { authedFetch } from '@/lib/client';
import { useSession, setSession, clearSession } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ActionDialog from '@/components/common/ActionDialog';
import NotForThisAccount from '@/components/common/NotForThisAccount';
import NotificationPrefs from '@/components/common/NotificationPrefs';
import AccountStanding from '@/components/account/AccountStanding';
import Devices from '@/components/account/Devices';
import { useReauth } from '@/components/common/Reauth';

/**
 * Account - the page every marketplace has and ours did not.
 *
 * Three things, the three that Amazon's "Login & security", Flipkart's
 * "Profile information" and Myntra's "Profile details" all let a person do
 * for themselves: change the name, change the password, leave. The email
 * stays as it is - changing it needs a verification loop that is not worth
 * building for a marketplace this size, and Google sign-in accounts have no
 * say in it anyway.
 *
 * DELETE MY ACCOUNT
 *   India's DPDP Act gives a person the right to erasure; Myntra puts it in
 *   the menu. Ours anonymises: the name, email and password go, the orders
 *   and reviews stay as records under "Deleted account" (the ledger is not
 *   theirs to erase). The dialog says exactly that before asking twice.
 */
function Section({ title, lead, children }) {
  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="font-semibold">{title}</h2>
      {lead && <p className="mt-1 text-sm text-muted-foreground">{lead}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function AccountView() {
  const router = useRouter();
  const { signedIn, user, role } = useSession();
  const [name, setName] = useState(user?.name || '');
  const [pw, setPw] = useState({ current: '', next: '', again: '' });
  const [busy, setBusy] = useState('');
  const [asking, setAsking] = useState(false);
  const reauth = useReauth();
  // Changing the sign-in email: step-up, then a code to the NEW address.
  const [emailNext, setEmailNext] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailStage, setEmailStage] = useState('idle'); // idle | code

  if (!signedIn) return <NotForThisAccount />;

  const saveName = async (e) => {
    e.preventDefault();
    setBusy('name');
    try {
      const d = await authedFetch('/auth/me', { method: 'PATCH', body: { name } });
      setSession({ role, user: { ...user, name: d.user.name } });
      toast.success('Name saved');
      router.refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy('');
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (pw.next !== pw.again) return toast.error('The two new passwords do not match');
    setBusy('pw');
    try {
      await authedFetch('/auth/change-password', { method: 'POST', body: { currentPassword: pw.current, newPassword: pw.next } });
      setPw({ current: '', next: '', again: '' });
      toast.success('Password changed');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy('');
    }
  };

  const requestEmail = async (e) => {
    e.preventDefault();
    setBusy('email');
    try {
      const d = await reauth.run(() => authedFetch('/auth/email/request', { method: 'POST', body: { email: emailNext.trim() } }));
      toast(d.message);
      setEmailStage('code');
    } catch (err) {
      if (err.code !== 'reauth_cancelled') toast.error(err.message);
    } finally {
      setBusy('');
    }
  };

  const confirmEmail = async (e) => {
    e.preventDefault();
    setBusy('email');
    try {
      const d = await authedFetch('/auth/email/confirm', { method: 'POST', body: { otp: emailCode } });
      setSession({ role: d.role, user: d.user });
      toast.success(d.message);
      setEmailStage('idle');
      setEmailNext('');
      setEmailCode('');
      router.refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy('');
    }
  };

  const deleteAccount = async () => {
    setBusy('delete');
    try {
      // The most final action there is: the password once more (step-up).
      const d = await reauth.run(() => authedFetch('/auth/me', { method: 'DELETE' }));
      clearSession();
      toast(d.message || 'Your account has been deleted.');
      router.push('/');
      router.refresh();
    } catch (err) {
      toast.error(err.message);
      setBusy('');
    }
  };

  return (
    <div className="space-y-6">
      {/* Fair Returns: an account under a restriction sees the reason here first. */}
      <AccountStanding />
      <Section title="Who you are" lead={`Signed in as ${user?.email || ''}.`}>
        <form onSubmit={saveName} className="flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1 space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={50} required />
          </div>
          <Button type="submit" disabled={busy === 'name' || name.trim() === (user?.name || '')}>
            {busy === 'name' ? 'Saving…' : 'Save'}
          </Button>
        </form>
      </Section>

      <Section title="Sign-in email" lead="Your email is the key to the account. Changing it asks for your password, then a code sent to the new address; every other device is signed out.">
        {emailStage === 'idle' ? (
          <form onSubmit={requestEmail} className="flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1 space-y-1.5">
              <Label htmlFor="email-next">New email</Label>
              <Input id="email-next" type="email" value={emailNext} onChange={(e) => setEmailNext(e.target.value)} required />
            </div>
            <Button type="submit" disabled={busy === 'email' || !emailNext}>
              {busy === 'email' ? 'Sending…' : 'Send code'}
            </Button>
          </form>
        ) : (
          <form onSubmit={confirmEmail} className="flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1 space-y-1.5">
              <Label htmlFor="email-code">The code sent to {emailNext}</Label>
              <Input id="email-code" inputMode="numeric" autoComplete="one-time-code" value={emailCode} onChange={(e) => setEmailCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))} required />
            </div>
            <Button type="submit" disabled={busy === 'email' || emailCode.length !== 6}>
              {busy === 'email' ? 'Checking…' : 'Change email'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => { setEmailStage('idle'); setEmailCode(''); }}>
              Cancel
            </Button>
          </form>
        )}
      </Section>

      <Section title="Password" lead="If you signed up with Google and never set a password, leave the current one empty.">
        <form onSubmit={changePassword} className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="cur">Current password</Label>
            <Input id="cur" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new">New password</Label>
            <Input id="new" type="password" autoComplete="new-password" minLength={6} required value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="again">New password, again</Label>
            <Input id="again" type="password" autoComplete="new-password" minLength={6} required value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} />
          </div>
          <div className="sm:col-span-3">
            <Button type="submit" variant="outline" disabled={busy === 'pw'}>
              {busy === 'pw' ? 'Changing…' : 'Change password'}
            </Button>
          </div>
        </form>
      </Section>

      {/* Order updates: confirmed, shipped, delivered, refunds - where they also go (plan 2.30). */}
      <Devices />
      <NotificationPrefs title="Order updates" lead="The bell has every update. Choose what also comes to your phone or email." />

      <Section title="Delete my account" lead="Your name, email and sign-in are removed. Orders and reviews stay as records, no longer tied to you by name. This cannot be undone.">
        <Button variant="outline" className="text-destructive" onClick={() => setAsking(true)} disabled={busy === 'delete'}>
          Delete my account
        </Button>
      </Section>

      <ActionDialog
        open={asking}
        onOpenChange={setAsking}
        title="Delete this account?"
        description="You will be signed out and cannot sign in again. Open orders must finish first - if any are on the way, we will say so."
        confirmLabel="Yes, delete it"
        destructive
        busy={busy === 'delete'}
        onConfirm={deleteAccount}
      />
    </div>
  );
}
