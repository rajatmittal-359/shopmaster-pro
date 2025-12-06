import { Link } from 'react-router-dom';

export default function ProductCard({ product }) {
  return (
    <Link
      to={`/customer/products/${product._id}`}
      className="bg-white rounded shadow hover:shadow-lg transition p-4 block"
    >
      <div className="aspect-square bg-gray-200 rounded mb-3 flex items-center justify-center overflow-hidden">
        {product.images && product.images.length > 0 ? (
          <img
            src={product.images[0]}
            alt={product.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-gray-400 text-sm">No Image</span>
        )}
      </div>
      <h3 className="font-semibold text-sm mb-1 truncate">{product.name}</h3>
      <p className="text-xs text-gray-600 mb-2 line-clamp-2">
        {product.description}
      </p>
      <div className="flex justify-between items-center">
        <p className="text-lg font-bold text-orange-600">₹{product.price}</p>
        <p className="text-xs text-gray-500">
          {product.stock > 0 ? `Stock: ${product.stock}` : 'Out of stock'}
        </p>
      </div>
      {product.category?.name && (
        <p className="text-xs text-gray-400 mt-2">
          Category: {product.category.name}
        </p>
      )}
    </Link>
  );
}
