import GoogleStatus from "@/components/admin/GoogleStatus";
import PageHeader from "@/components/panel/PageHeader";

export const metadata = { title: "Google" };

export default function AdminGooglePage() {
  return (
    <>
      <PageHeader
        title="Google"
        lead="Is each product page in Google's index, and is each item approved for Shopping. Google's own answers, not ours."
      />
      <GoogleStatus />
    </>
  );
}
