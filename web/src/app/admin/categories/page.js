import Categories from "@/components/admin/Categories";
import PageHeader from "@/components/panel/PageHeader";

export const metadata = { title: "Categories" };

export default function AdminCategoriesPage() {
  return (
    <>
      <PageHeader
        title="Categories"
        lead="The tree every product sits in. Products go on leaves only."
      />
      <Categories />
    </>
  );
}
