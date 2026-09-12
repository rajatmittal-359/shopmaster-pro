import Sellers from "@/components/admin/Sellers";
import PageHeader from "@/components/panel/PageHeader";

export const metadata = { title: "Sellers" };

export default function AdminSellersPage() {
  return (
    <>
      <PageHeader
        title="Sellers"
        lead="Who sells here, who is waiting to, and what each pays."
      />
      <Sellers />
    </>
  );
}
