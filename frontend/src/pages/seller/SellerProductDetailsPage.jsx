import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../../components/common/Layout";
import api from "../../utils/api";
import { deleteProduct } from "../../services/sellerService";
import { toastSuccess, toastError } from "../../utils/toast";

import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination } from "swiper/modules";

import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";

export default function SellerProductDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProduct();
  }, []);

  const fetchProduct = async () => {
    try {
      const res = await api.get(`/seller/products/${id}`);
      setProduct(res.data.product);
    } catch (err) {
      toastError("Product not found");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this product permanently?")) return;

    try {
      await deleteProduct(product._id);
      toastSuccess("Product deleted");
      navigate("/seller/products");
    } catch (err) {
      toastError(err?.response?.data?.message || "Delete failed");
    }
  };

  if (loading) {
    return (
      <Layout title="Product Details">
        <p className="p-6">Loading...</p>
      </Layout>
    );
  }

  if (!product) {
    return (
      <Layout title="Product Details">
        <p className="p-6 text-red-500">Product not found.</p>
      </Layout>
    );
  }

  return (
    <Layout title="Product Details">
      <div className="max-w-6xl mx-auto p-4 space-y-6">

        {/* ✅ MULTI IMAGE SLIDER */}
        {product.images?.length > 0 && (
          <Swiper
            modules={[Navigation, Pagination]}
            navigation
            pagination={{ clickable: true }}
            slidesPerView={1}
            className="w-full h-[350px] rounded border bg-white"
          >
            {product.images.map((img, i) => (
              <SwiperSlide key={i}>
                <img
                  src={img}
                  alt={product.name}
                  className="w-full h-[350px] object-contain"
                />
              </SwiperSlide>
            ))}
          </Swiper>
        )}

        {/* ✅ ACTION BUTTONS */}
        <div className="flex justify-end gap-3">
          <button
            onClick={() => navigate(`/seller/products?edit=${product._id}`)}
            className="px-4 py-2 border border-blue-500 text-blue-600 rounded hover:bg-blue-50 text-sm"
          >
            Edit
          </button>

          <button
            onClick={handleDelete}
            className="px-4 py-2 border border-red-500 text-red-600 rounded hover:bg-red-50 text-sm"
          >
            Delete
          </button>
        </div>

        {/* ✅ MAIN INFO GRID */}
        <div className="bg-white rounded border p-5 grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* LEFT */}
          <div className="space-y-3">
            <h2 className="text-2xl font-bold">{product.name}</h2>

            <p className="text-sm text-gray-500">
              Category: <span className="font-medium">{product.category?.name}</span>
            </p>

            <p className="text-2xl font-bold text-orange-600">₹{product.price}</p>

            <p className="text-sm">
              Stock:{" "}
              <span className={`font-semibold ${
                product.stock <= product.lowStockThreshold ? "text-red-600" : "text-green-600"
              }`}>
                {product.stock}
              </span>
            </p>

<p className="text-sm">
  Status:{" "}
  <span
    className={`font-semibold ${
      product.isActive ? "text-green-600" : "text-gray-500"
    }`}
  >
    {product.isActive ? "Active" : "Inactive"}
  </span>
</p>

          </div>

          {/* RIGHT */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="border p-3 rounded">
              <p className="text-gray-500">Low Stock Alert</p>
              <p className="font-semibold">{product.lowStockThreshold}</p>
            </div>

            <div className="border p-3 rounded">
              <p className="text-gray-500">Total Orders</p>
              <p className="font-semibold">—</p>
            </div>

            <div className="border p-3 rounded col-span-2">
              <p className="text-gray-500">Created At</p>
              <p className="font-semibold">
                {new Date(product.createdAt).toLocaleString()}
              </p>
            </div>

            <div className="border p-3 rounded col-span-2">
              <p className="text-gray-500">Last Updated</p>
              <p className="font-semibold">
                {new Date(product.updatedAt).toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        {/* ✅ DESCRIPTION WITH BULLET SUPPORT */}
        <div className="bg-white rounded border p-5">
          <h3 className="font-semibold mb-2">Description</h3>

          <div
            className="prose max-w-none text-sm text-gray-700"
            dangerouslySetInnerHTML={{
              __html: product.description.replace(/\n/g, "<br/>"),
            }}
          />
        </div>

      </div>
    </Layout>
  );
}
