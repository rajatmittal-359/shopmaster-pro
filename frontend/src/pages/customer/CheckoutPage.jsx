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
  const [paymentMethod, setPaymentMethod] = useState("cod"); // "cod" | "online"

  const navigate = useNavigate();

  // Load cart + addresses
  useEffect(() => {
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
      } catch (err) {
        console.error(err);
        toastError(
          err.response?.data?.message || "Failed to load checkout details"
        );
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

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

      // ONLINE PAYMENT (Razorpay via global script)
      if (paymentMethod === "online") {
        const res = await api.post("/customer/checkout-online", {
          shippingAddressId: selectedAddressId,
        });

        if (!res.data.success) {
          toastError(res.data.message || "Failed to start payment");
          setPlacing(false);
          return;
        }

        const options = {
          key: res.data.keyId || import.meta.env.VITE_RAZORPAY_KEY_ID,
          amount: res.data.amount, // in paise
          currency: res.data.currency,
          name: "ShopMaster Pro",
          description: "Order Payment",
          order_id: res.data.orderId,
          handler: async function (response) {
            try {
              const verifyRes = await api.post("/customer/verify-payment", {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                dbOrderId: res.data.dbOrderId,
              });

              if (verifyRes.data.success) {
                toastSuccess("Payment successful!");
                navigate("/customer/orders");
              } else {
                toastError(
                  verifyRes.data.message || "Payment verification failed"
                );
              }
            } catch (err) {
              toastError(
                err.response?.data?.message || "Payment verification failed"
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
            ondismiss: function () {
              setPlacing(false);
              toastError("Payment cancelled");
            },
          },
        };

        if (!window.Razorpay) {
          toastError("Payment SDK not loaded. Please refresh the page.");
          setPlacing(false);
          return;
        }

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
                      alt=""
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
              <span className="font-bold text-lg">₹{cart.totalAmount}</span>
            </div>
          </div>

          {/* SHIPPING ADDRESS */}
          <div className="bg-white p-5 rounded shadow">
            <h2 className="text-lg font-semibold mb-4">2. Delivery Address</h2>

            {addresses.length === 0 && (
              <p className="text-sm text-gray-600">
                You have no saved addresses. Please add one from “My
                Addresses”.
              </p>
            )}

            {addresses.length > 0 && (
              <div className="space-y-3">
                {addresses.map((addr) => (
                  <label
                    key={addr._id}
                    className={`block border rounded p-3 cursor-pointer ${
                      selectedAddressId === addr._id
                        ? "border-orange-500 bg-orange-50"
                        : ""
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
                    <p className="text-xs">{addr.country}</p>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT SUMMARY */}
        <div className="bg-white p-5 rounded shadow h-fit sticky top-20">
          <h2 className="text-lg font-semibold mb-4">3. Order Summary</h2>

          <div className="flex justify-between text-sm mb-2">
            <span>Items Total</span>
            <span>₹{cart.totalAmount}</span>
          </div>

          <div className="flex justify-between text-sm mb-2">
            <span>Delivery</span>
            <span className="text-green-600">FREE</span>
          </div>

          <div className="flex justify-between font-bold text-base border-t pt-3 mt-3">
            <span>Grand Total</span>
            <span>₹{cart.totalAmount}</span>
          </div>

          {/* PAYMENT METHOD */}
          <div className="bg-white mt-4 mb-3">
            <h3 className="text-sm font-semibold mb-2">Payment Method</h3>

            <label className="flex items-center gap-2 mb-2 cursor-pointer">
              <input
                type="radio"
                name="payment"
                value="cod"
                checked={paymentMethod === "cod"}
                onChange={(e) => setPaymentMethod(e.target.value)}
              />
              <span>Cash on Delivery</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="payment"
                value="online"
                checked={paymentMethod === "online"}
                onChange={(e) => setPaymentMethod(e.target.value)}
              />
              <span>Pay Online (UPI / Card / Net Banking)</span>
            </label>
          </div>

          <div className="mt-2 text-xs text-gray-600 bg-gray-50 p-3 rounded">
            ✅ Cash on Delivery & Online payments <br />
            ✅ Secure Payments via Razorpay <br />
            ✅ Easy Return Policy
          </div>

          <button
            onClick={handlePlaceOrder}
            disabled={placing || addresses.length === 0}
            className="w-full mt-4 bg-orange-500 hover:bg-orange-600 text-white py-2 rounded text-sm font-semibold disabled:opacity-60"
          >
            {placing
              ? paymentMethod === "online"
                ? "Redirecting to payment..."
                : "Placing Order..."
              : paymentMethod === "online"
              ? "Proceed to Payment"
              : "Place Order (COD)"}
          </button>
        </div>
      </div>
    </Layout>
  );
}
