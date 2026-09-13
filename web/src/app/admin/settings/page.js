import PlatformSettings from "@/components/admin/PlatformSettings";
import PageHeader from "@/components/panel/PageHeader";

export const metadata = { title: "Settings" };

export default function AdminSettingsPage() {
  return (
    <>
      <PageHeader title="Settings" lead="Who we are, the seller rulebook, what is switched on, and the announcement bar - changed here, not in code." />
      <PlatformSettings />
    </>
  );
}
