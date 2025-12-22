// src/pages/customer/CheckoutPage.jsx

import { useEffect, useState } from "react";
import Layout from "../../components/common/Layout";
import { getCart } from "../../services/cartService";
import { getAddresses } from "../../services/addressService";
import { useNavigate } from "react-router-dom";
import { toastSuccess, toastError } from "../../utils/toast";
import api from "../../utils/api";

export default function CheckoutPage() {
  const [cart, setCart] = useState(null);
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("cod");

  // pricing
  const [itemsTotal, setItemsTotal] = useState(0);
  const [shippingCharges, setShippingCharges] = useState(0);
  const [grandTotal, setGrandTotal] = useState(0);
  const [calculatingTotals, setCalculatingTotals] = useState(false);

  const navigate = useNavigate();

  // Load cart + addresses
  const loadData = async () => {
    try {
      setLoading(true);

      const [cartRes, addrRes] = await Promise.all([
        getCart(),
        getAddresses(),
      ]);

      const c = cartRes.data.cart;
      setCart(c);

      const list = addrRes.data.addresses || [];
      setAddresses(list);

      const def = list.find((a) => a.isDefault);
      if (def) setSelectedAddressId(def._id);
      else if (list[0]) setSelectedAddressId(list[0]._id);

      // basic totals
      setItemsTotal(c?.totalAmount || 0);
    } catch (err) {
      console.error(err);
      toastError(
        err.response?.data?.message || "Failed to load checkout details"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Whenever address or paymentMethod or cart change → get real totals from backend
  useEffect(() => {
    const canPreview =
      selectedAddressId && cart && cart.items && cart.items.length > 0;

    if (!canPreview) return;

    const preview = async () => {
      try {
        setCalculatingTotals(true);
        const res = await api.post("/customer/checkout-preview", {
          shippingAddressId: selectedAddressId,
          paymentMethod,
        });

        if (res.data.success) {
          setItemsTotal(res.data.itemsTotal);
          setShippingCharges(res.data.shippingCharges);
          setGrandTotal(res.data.grandTotal);
        } else {
          toastError(
            res.data.message || "Failed to calculate shipping & total amount"
          );
          // fallback – show items only
          setItemsTotal(cart.totalAmount);
          setShippingCharges(0);
          setGrandTotal(cart.totalAmount);
        }
      } catch (err) {
        console.error("PREVIEW ERROR:", err.message);
        toastError(
          err.response?.data?.message ||
            "Could not calculate shipping. Using items total only."
        );
        setItemsTotal(cart.totalAmount);
        setShippingCharges(0);
        setGrandTotal(cart.totalAmount);
      } finally {
        setCalculatingTotals(false);
      }
    };

    preview();
  }, [selectedAddressId, paymentMethod, cart]);

  const handlePlaceOrder = async () => {
    if (!selectedAddressId) {
      toastError("Please select a shipping address");
      return;
    }

    if (!cart || !cart.items || cart.items.length === 0) {
      toastError("Cart is empty");
      return;
    }

    try {
      setPlacing(true);

      // ONLINE PAYMENT (Razorpay)
      if (paymentMethod === "online") {
        const res = await api.post("/customer/checkout-online", {
          shippingAddressId: selectedAddressId,
        });

        if (!res.data.success) {
          toastError(res.data.message || "Failed to start payment");
          setPlacing(false);
          return;
        }

        if (!window.Razorpay) {
          toastError("Payment SDK not loaded. Please refresh the page.");
          setPlacing(false);
          return;
        }

        const payable = (res.data.amount || 0) / 100; // in rupees

        const options = {
          key: res.data.keyId || import.meta.env.VITE_RAZORPAY_KEY_ID,
          amount: res.data.amount, // in paise
          currency: res.data.currency,
          name: "ShopMaster Pro",
          description: `Order Payment (₹${payable})`,
          order_id: res.data.orderId,
          handler: async function (response) {
            try {
              toastSuccess("Payment received. Verifying your order...");

              const verifyRes = await api.post("/customer/verify-payment", {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                dbOrderId: res.data.dbOrderId,
              });

              if (verifyRes.data.success) {
                toastSuccess("Order placed successfully!");
                navigate("/customer/orders");
              } else {
                toastError(
                  verifyRes.data.message ||
                    "Payment could not be verified. If money was deducted, please contact support."
                );
              }
            } catch (err) {
              toastError(
                err.response?.data?.message ||
                  "Payment verification failed. If money was deducted, please contact support."
              );
            } finally {
              setPlacing(false);
            }
          },
          prefill: {
            name: "",
            email: "",
          },
          theme: {
            color: "#EA580C",
          },
          modal: {
            escape: false,
            ondismiss: function () {
              setPlacing(false);
              toastError(
                "Payment cancelled. You have not been charged, you can try again."
              );
            },
          },
        };

        const rzp = new window.Razorpay(options);

        rzp.on("payment.failed", function (response) {
          toastError(response.error?.description || "Payment failed");
          setPlacing(false);
        });

        rzp.open();
        return;
      }

      // COD FLOW
      const res = await api.post("/customer/checkout-cod", {
        shippingAddressId: selectedAddressId,
      });

      if (res.data.success && res.data.order?._id) {
        toastSuccess("Order placed successfully!");
        navigate("/customer/orders");
      } else {
        toastError("Order placed but response invalid");
      }
    } catch (err) {
      const message = err.response?.data?.message || "Failed to place order";
      toastError(message);
    } finally {
      setPlacing(false);
    }
  };

  if (loading) {
    return (
      <Layout title="Checkout">
        <p className="p-6">Loading...</p>
      </Layout>
    );
  }

  if (!cart || !cart.items || cart.items.length === 0) {
    return (
      <Layout title="Checkout">
        <div className="bg-white p-6 rounded shadow max-w-xl">
          <h2 className="text-lg font-semibold mb-2">Your cart is empty</h2>
          <p className="text-sm text-gray-600 mb-4">
            Add some products to your cart before checking out.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Checkout">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6 p-4">
        {/* LEFT SECTION */}
        <div className="lg:col-span-2 space-y-6">
          {/* REVIEW ITEMS */}
          <div className="bg-white p-5 rounded shadow">
            <h2 className="text-lg font-semibold mb-4">
              1. Review Your Items
            </h2>

            <div className="space-y-4">
              {cart.items.map((item) => (
                <div
                  key={item.productId._id}
                  className="flex justify-between items-center border-b pb-3"
                >
                  <div className="flex items-center gap-4">
                    <img
                      src={item.productId.images?.[0]}
                      alt={item.productId.name}
                      className="w-16 h-16 rounded object-cover border"
                    />
                    <div>
                      <p className="text-sm font-medium">
                        {item.productId.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        ₹{item.price} × {item.quantity}
                      </p>
                    </div>
                  </div>

                  <p className="text-sm font-semibold">
                    ₹{item.price * item.quantity}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-4 flex justify-between items-center border-t pt-4">
              <span className="font-semibold text-sm">Subtotal</span>
              <span className="font-bold text-lg">₹{itemsTotal}</span>
            </div>
          </div>

          {/* SHIPPING ADDRESS */}
          <div className="bg-white p-5 rounded shadow">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">2. Delivery Address</h2>

              <div className="flex items-center gap-3">
                {addresses.length > 0 && (
                  <button
                    type="button"
                    onClick={loadData}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Refresh
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => navigate("/customer/addresses")}
                  className="text-xs text-orange-600 hover:underline font-semibold"
                >
                  Manage addresses
                </button>
              </div>
            </div>

            {addresses.length === 0 && (
              <p className="text-sm text-gray-600">
                You have no saved addresses. Click{" "}
                <span className="font-semibold">"Manage addresses"</span> above
                to add a new address, then return to this page and press{" "}
                <span className="font-semibold">"Refresh"</span>.
              </p>
            )}

            {addresses.length > 0 && (
              <>
                <p className="text-xs text-gray-600 mb-3">
                  Want to change the address? Click{" "}
                  <span className="font-semibold">"Manage addresses"</span> to
                  add or edit, then come back here and press{" "}
                  <span className="font-semibold">"Refresh"</span> to see the
                  latest list.
                </p>

                <div className="space-y-3">
                  {addresses.map((addr) => (
                    <label
                      key={addr._id}
                      className={`block border rounded p-3 cursor-pointer transition-all ${
                        selectedAddressId === addr._id
                          ? "border-orange-500 bg-orange-50"
                          : "hover:border-gray-400"
                      }`}
                    >
                      <input
                        type="radio"
                        name="address"
                        className="mr-2"
                        checked={selectedAddressId === addr._id}
                        onChange={() => setSelectedAddressId(addr._id)}
                      />

                      <span className="font-semibold text-sm">
                        {addr.label}
                      </span>

                      {addr.isDefault && (
                        <span className="ml-2 text-[10px] bg-green-100 text-green-700 px-1 rounded">
                          Default
                        </span>
                      )}

                      <p className="text-xs mt-1">
                        {addr.street}, {addr.city}, {addr.state} -{" "}
                        {addr.zipCode}
                      </p>
                      <p className="text-xs text-gray-500">
                        {addr.country} • {addr.phoneNumber}
                      </p>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* RIGHT SUMMARY */}
        <div className="bg-white p-5 rounded shadow h-fit sticky top-20">
          <h2 className="text-lg font-semibold mb-4">3. Order Summary</h2>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Items Total</span>
              <span className="font-medium">₹{itemsTotal}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600">Shipping</span>
              {calculatingTotals ? (
                <span className="text-xs text-blue-500 animate-pulse">
                  Calculating...
                </span>
              ) : (
                <span className="font-medium text-green-600">
                  ₹{shippingCharges}
                </span>
              )}
            </div>
          </div>

          <div className="flex justify-between font-bold text-lg border-t pt-3 mt-3">
            <span>Order Total</span>
            <span className="text-orange-600">₹{grandTotal}</span>
          </div>

          <p className="text-xs text-gray-500 mt-2">
            This is the final amount including shipping. You will see the same
            total on the payment page.
          </p>

          {/* PAYMENT METHOD */}
          <div className="mt-4 mb-3">
            <h3 className="text-sm font-semibold mb-2">Payment Method</h3>

            <label className="flex items-center gap-2 mb-2 cursor-pointer p-2 border rounded hover:bg-gray-50">
              <input
                type="radio"
                name="payment"
                value="cod"
                checked={paymentMethod === "cod"}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="accent-orange-500"
              />
              <span className="text-sm">Cash on Delivery</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer p-2 border rounded hover:bg-gray-50">
              <input
                type="radio"
                name="payment"
                value="online"
                checked={paymentMethod === "online"}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="accent-orange-500"
              />
              <span className="text-sm">
                Pay Online (UPI / Card / Net Banking)
              </span>
            </label>
          </div>

          <button
            onClick={handlePlaceOrder}
            disabled={
              placing || addresses.length === 0 || calculatingTotals
            }
            className="w-full mt-4 bg-orange-500 hover:bg-orange-600 text-white py-3 rounded font-semibold disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {placing
              ? paymentMethod === "online"
                ? "Redirecting to payment..."
                : "Placing Order..."
              : paymentMethod === "online"
              ? `Pay ₹${grandTotal} Online`
              : `Place Order (COD – ₹${grandTotal})`}
          </button>

          {addresses.length === 0 && (
            <p className="text-xs text-red-500 mt-2 text-center">
              Please add a delivery address to proceed
            </p>
          )}
        </div>
      </div>
    </Layout>
  );
}
