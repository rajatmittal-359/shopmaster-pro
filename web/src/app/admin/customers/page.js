import Customers from "@/components/admin/Customers";
import PageHeader from "@/components/panel/PageHeader";

export const metadata = { title: "Customers" };

export default function AdminCustomersPage() {
  return (
    <>
      <PageHeader title="Customers" lead="Who buys here, what they spend, and the few whose cancels and disputes cost sellers money." />
      <Customers />
    </>
  );
}
