import PlatformSettings from "@/components/admin/PlatformSettings";
import PageHeader from "@/components/panel/PageHeader";
import PushToggle from "@/components/seller/PushToggle";
import NotificationPrefs from "@/components/common/NotificationPrefs";

export const metadata = { title: "Settings" };

export default function AdminSettingsPage() {
  return (
    <>
      <PageHeader title="Settings" lead="Who we are, the seller rulebook, what is switched on, and the announcement bar - changed here, not in code." />
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        {/* The admin's own phone and mailbox: disputes, held reviews, new sellers (plan 2.30). */}
        <PushToggle />
        <NotificationPrefs title="What reaches you where" lead="The bell lists everything. Choose what also buzzes or mails." />
      </div>
      <PlatformSettings />
    </>
  );
}
