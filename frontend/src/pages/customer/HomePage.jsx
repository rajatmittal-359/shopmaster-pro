import { useEffect, useState } from 'react';
import Layout from '../../components/common/Layout';
import ProductCard from '../../components/customer/ProductCard';
import api from '../../utils/api';
import Loader from '../../components/common/Loader';
export default function HomePage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const res = await api.get('/customer/products');
      setProducts(res.data.products || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
{loading && <Loader />}
  return (
    <Layout title="Shop">
      <h2 className="text-2xl font-bold mb-4">Browse Products</h2>

      {loading && (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
        </div>
      )}

      {!loading && products.length === 0 && (
        <div className="bg-white rounded shadow p-6 text-center text-gray-500">
          <p>No products available yet.</p>
        </div>
      )}

      {!loading && products.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {products.map((product) => (
            <ProductCard key={product._id} product={product} />
          ))}
        </div>
      )}
    </Layout>
  );
}
