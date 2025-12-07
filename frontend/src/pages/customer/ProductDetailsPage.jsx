import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Layout from '../../components/common/Layout';
import { getProductDetails } from '../../services/productService';
import { addToCart } from '../../services/cartService';

export default function ProductDetailsPage() {
  const { productId } = useParams();
  const [product, setProduct] = useState(null);
  const [activeImage, setActiveImage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await getProductDetails(productId);
        const p = res.data.product;
        setProduct(p);
        setActiveImage(p.images?.[0] || '');
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [productId]);

  const handleAddToCart = async () => {
    await addToCart({ productId, quantity: 1 });
    alert('Added to cart');
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
        <p>Product not found.</p>
      </Layout>
    );
  }

  return (
    <Layout title={product.name}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* ✅ IMAGE GALLERY */}
        <div>
          <div className="h-80 bg-gray-100 rounded flex items-center justify-center mb-3">
            {activeImage ? (
              <img src={activeImage} className="h-full object-contain" />
            ) : (
              'No image'
            )}
          </div>

          <div className="flex gap-2">
            {product.images?.map((img, i) => (
              <img
                key={i}
                src={img}
                onClick={() => setActiveImage(img)}
                className={`w-16 h-16 object-cover border rounded cursor-pointer ${
                  activeImage === img ? 'border-orange-500' : ''
                }`}
              />
            ))}
          </div>
        </div>

        {/* ✅ PRODUCT INFO */}
        <div>
          <h1 className="text-2xl font-bold mb-2">{product.name}</h1>
          <p className="text-xl font-semibold text-orange-600 mb-2">
            ₹{product.price}
          </p>
          <p className="text-sm mb-2">
            Stock: <strong>{product.stock}</strong>
          </p>

          <button
            onClick={handleAddToCart}
            className="px-4 py-2 bg-orange-500 text-white rounded"
          >
            Add to Cart
          </button>

          {/* ✅ CKEDITOR HTML DESCRIPTION */}
          <div className="mt-6">
            <h3 className="font-semibold mb-2">Product Details</h3>
            <div
              className="prose max-w-none text-sm"
              dangerouslySetInnerHTML={{ __html: product.description }}
            />
          </div>
        </div>
      </div>
    </Layout>
  );
}
