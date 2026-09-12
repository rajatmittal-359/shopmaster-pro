import Coupons from "@/components/admin/Coupons";
import PageHeader from "@/components/panel/PageHeader";

export const metadata = { title: "Coupons" };

export default function AdminCouponsPage() {
  return (
    <>
      <PageHeader
        title="Coupons"
        lead="Codes, who funds them, and how often they were used."
      />
      <Coupons />
    </>
  );
}
