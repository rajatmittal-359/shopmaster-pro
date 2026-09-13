import Products from "@/components/admin/Products";
import PageHeader from "@/components/panel/PageHeader";

export const metadata = { title: "Products" };

export default function AdminProductsPage() {
  return (
    <>
      <PageHeader title="Products" lead="Every seller's catalogue in one list - the listing score each seller sees, stock, and what is hidden." />
      <Products />
    </>
  );
}
