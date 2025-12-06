import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Layout from '../../components/common/Layout';
import { getProductDetails } from '../../services/productService';
import { addToCart } from '../../services/cartService';

export default function ProductDetailsPage() {
  const { productId } = useParams();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await getProductDetails(productId);
        setProduct(res.data.product);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [productId]);

  const handleAddToCart = async () => {
    try {
      setAdding(true);
      await addToCart({ productId, quantity: 1 });
      alert('Added to cart');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to add to cart');
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return (
      <Layout title="Product">
        <p>Loading...</p>
      </Layout>
    );
  }

  if (!product) {
    return (
      <Layout title="Product">
        <p className="text-sm text-gray-600">Product not found.</p>
      </Layout>
    );
  }

  return (
    <Layout title={product.name}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <div className="h-64 bg-gray-100 rounded flex items-center justify-center text-sm text-gray-400">
            {product.images?.[0] ? 'Image' : 'No image'}
          </div>
        </div>
        <div>
          <h1 className="text-2xl font-bold mb-2">{product.name}</h1>
          <p className="text-sm text-gray-600 mb-3">{product.description}</p>
          <p className="text-sm text-gray-500 mb-1">
            Category: {product.category?.name}
          </p>
          <p className="text-xl font-semibold mb-4">₹{product.price}</p>
          <p className="text-sm mb-2">
            Stock:{' '}
            <span
              className={
                product.stock <= product.lowStockThreshold
                  ? 'text-red-600'
                  : 'text-green-600'
              }
            >
              {product.stock}
            </span>
          </p>
          <button
            onClick={handleAddToCart}
            disabled={adding || product.stock <= 0}
            className="px-4 py-2 bg-orange-500 text-white rounded text-sm hover:bg-orange-600 disabled:opacity-50"
          >
            {product.stock <= 0
              ? 'Out of stock'
              : adding
              ? 'Adding...'
              : 'Add to cart'}
          </button>
        </div>
      </div>
    </Layout>
  );
}
