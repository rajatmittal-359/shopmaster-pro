import Categories from '@/components/admin/Categories';

export const metadata = { title: 'Categories' };

export default function AdminCategoriesPage() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Categories</h1>
      <Categories />
    </>
  );
}
