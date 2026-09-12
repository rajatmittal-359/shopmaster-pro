import Overview from "@/components/admin/Overview";
import PageHeader from "@/components/panel/PageHeader";

export const metadata = { title: "Overview" };

export default function AdminHome() {
  return (
    <>
      <PageHeader
        title="Overview"
        lead="What is waiting on you, and how the marketplace is doing."
      />
      <Overview />
    </>
  );
}
