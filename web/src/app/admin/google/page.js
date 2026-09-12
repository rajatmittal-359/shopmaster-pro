import GoogleStatus from "@/components/admin/GoogleStatus";
import Traffic from "@/components/admin/Traffic";
import Speed from "@/components/admin/Speed";
import PageHeader from "@/components/panel/PageHeader";

export const metadata = { title: "Google" };

export default function AdminGooglePage() {
  return (
    <>
      <PageHeader
        title="Google"
        lead="Visitors, page speed, the index and Shopping - Google's own answers about the shop, not ours."
      />
      <div className="mb-6 space-y-6">
        <Traffic days={28} />
        <Speed />
      </div>
      <GoogleStatus />
    </>
  );
}
