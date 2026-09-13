import AccountView from '@/components/account/AccountView';

export const metadata = { title: 'Account', robots: { index: false, follow: true } };

export default function AccountPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
      <p className="mt-1 text-sm text-muted-foreground">Your name, your password, and the door out.</p>
      <div className="mt-6">
        <AccountView />
      </div>
    </div>
  );
}
