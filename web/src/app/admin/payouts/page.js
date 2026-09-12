import Payouts from "@/components/admin/Payouts";
import PageHeader from "@/components/panel/PageHeader";

export const metadata = { title: "Payouts" };

export default function AdminPayoutsPage() {
  return (
    <>
      <PageHeader
        title="Payouts"
        lead="Who is owed money, and marking it paid once the bank has it."
      />
      <Payouts />
    </>
  );
}
