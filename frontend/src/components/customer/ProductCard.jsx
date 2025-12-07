// frontend/src/components/customer/ProductCard.jsx
import { Link } from 'react-router-dom';

function stripHtml(html = '') {
  return html.replace(/<[^>]+>/g, '');
}

export default function ProductCard({ product }) {
  const image = product.images?.[0];
  const plainDesc = stripHtml(product.description || '');
  const shortDesc =
    plainDesc.length > 90 ? plainDesc.slice(0, 90).trim() + '…' : plainDesc;

  const isLowStock =
    typeof product.lowStockThreshold === 'number' &&
    product.stock <= product.lowStockThreshold;

  return (
    <Link
      to={`/customer/products/${product._id}`}
      className="group bg-white rounded-lg shadow-sm hover:shadow-md transition border flex flex-col"
    >
      {/* IMAGE */}
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-t-lg bg-gray-100">
        {image ? (
          <img
            src={image}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
            No image
          </div>
        )}

        {isLowStock && (
          <span className="absolute top-2 left-2 px-2 py-0.5 text-[11px] rounded-full bg-red-100 text-red-700">
            Low stock
          </span>
        )}
      </div>

      {/* BODY */}
      <div className="flex-1 p-3 flex flex-col gap-1">
        <h3 className="font-semibold text-sm line-clamp-2 group-hover:text-orange-600">
          {product.name}
        </h3>

        {shortDesc && (
          <p className="text-xs text-gray-600 line-clamp-2">{shortDesc}</p>
        )}

        <p className="text-[11px] text-gray-500 mt-1">
          Seller: {product.sellerId?.name || 'Unknown'}
        </p>
        <p className="text-[11px] text-gray-500">
          Category: {product.category?.name || 'Uncategorized'}
        </p>

        <div className="flex items-center justify-between mt-2">
          <span className="text-base font-bold text-orange-600">
            ₹{product.price}
          </span>
          <span className="text-[11px] text-gray-500">
            Stock: {product.stock}
          </span>
        </div>

        <button
          type="button"
          className="mt-3 w-full border border-orange-500 text-orange-600 text-xs font-semibold py-1.5 rounded group-hover:bg-orange-500 group-hover:text-white transition"
        >
          View Details
        </button>
      </div>
    </Link>
  );
}
