import GoogleStatus from "@/components/admin/GoogleStatus";
import Traffic from "@/components/admin/Traffic";
import Speed from "@/components/admin/Speed";
import PageHeader from "@/components/panel/PageHeader";
import GoogleMap from "@/components/admin/GoogleMap";

export const metadata = { title: "Google" };

export default function AdminGooglePage() {
  return (
    <>
      <PageHeader
        title="Google"
        lead="Visitors, page speed, the index and Shopping - Google's own answers about the shop, not ours."
      />
      {/* The two worlds (15 Sep): what the code does, what only the admin's Google account can. */}
      <div className="mb-6"><GoogleMap /></div>
      <div className="mb-6 space-y-6">
        <Traffic days={28} />
        <Speed />
      </div>
      <GoogleStatus />
    </>
  );
}
