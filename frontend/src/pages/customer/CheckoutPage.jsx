// src/pages/customer/CheckoutPage.jsx

import { useEffect, useState } from "react";
import Layout from "../../components/common/Layout";
import { getCart } from "../../services/cartService";
import { getAddresses } from "../../services/addressService";
import { useNavigate } from "react-router-dom";
import { useCart } from "../../context/cartContext";
import { toastSuccess, toastError } from "../../utils/toast";
import { previewCoupon } from "../../services/orderService";
import { money } from "../../utils/money";
import api from "../../utils/api";

export default function CheckoutPage() {
  // Checkout empties the cart on the server; the badge has to follow.
  const { refresh: refreshCart } = useCart();
  const [cart, setCart] = useState(null);
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("cod");

  // pricing
  const [itemsTotal, setItemsTotal] = useState(0);
  const [shippingCharges, setShippingCharges] = useState(0);
  // Delivery speeds this address can actually have. Same-day only appears when
  // a hyperlocal rider will genuinely take it, so the list is address-specific.
  const [deliveryOptions, setDeliveryOptions] = useState([]);
  const [deliveryOption, setDeliveryOption] = useState('standard');
  const [grandTotal, setGrandTotal] = useState(0);
  const [calculatingTotals, setCalculatingTotals] = useState(false);

  /*
   * A coupon the customer has actually had confirmed.
   *
   * Held apart from the box they type into, so a half-typed code never reads as
   * applied. The checkout re-evaluates from scratch anyway - this is what the
   * page shows, not what the order is charged.
   */
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState(null);
  const [couponError, setCouponError] = useState(null);
  const [checkingCoupon, setCheckingCoupon] = useState(false);

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
  // ✅ FIXED: Debounced shipping calculation
  useEffect(() => {
    const canPreview = selectedAddressId && cart && cart.items && cart.items.length > 0;
    if (!canPreview) return;

    // Debounce: wait 500ms after last change
    const timer = setTimeout(async () => {
      try {
        setCalculatingTotals(true);
        const res = await api.post('/customer/checkout-preview', {
          shippingAddressId: selectedAddressId,
          paymentMethod,
          deliveryOption,
        });

        if (res.data.success) {
          setItemsTotal(res.data.itemsTotal);
          setShippingCharges(res.data.shippingCharges);
          setGrandTotal(res.data.grandTotal);
          setDeliveryOptions(res.data.deliveryOptions || []);
          // The server decides what is available; if same-day is gone by the
          // time we ask, it tells us which option it actually priced.
          if (res.data.deliveryOption) setDeliveryOption(res.data.deliveryOption);
        } else {
          toastError(res.data.message || 'Failed to calculate shipping');
          // Fallback
          setItemsTotal(cart.totalAmount);
          setShippingCharges(0);
          setGrandTotal(cart.totalAmount);
        }
      } catch (err) {
        console.error('PREVIEW ERROR:', err.message);
        toastError('Could not calculate shipping. Using items total only.');
        // Fallback
        setItemsTotal(cart.totalAmount);
        setShippingCharges(0);
        setGrandTotal(cart.totalAmount);
      } finally {
        setCalculatingTotals(false);
      }
    }, 500); // Debounce 500ms

    return () => clearTimeout(timer);
  }, [selectedAddressId, paymentMethod, deliveryOption]);


  const applyCoupon = async () => {
    const code = couponInput.trim();
    if (!code) return;

    setCheckingCoupon(true);
    setCouponError(null);
    try {
      const { data } = await previewCoupon(code);
      if (data.success) {
        setCoupon({ code: data.code, discount: data.discount, description: data.description });
        toastSuccess(data.message);
      } else {
        // Their own words, not "invalid coupon" - a customer who is RS 200
        // short of the minimum will add RS 200 of jewellery if told so.
        setCoupon(null);
        setCouponError(data.message);
      }
    } catch (err) {
      setCouponError(err?.response?.data?.message || 'Could not check that code');
    } finally {
      setCheckingCoupon(false);
    }
  };

  const removeCoupon = () => {
    setCoupon(null);
    setCouponInput('');
    setCouponError(null);
  };

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
          deliveryOption,
          couponCode: coupon?.code || undefined,
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
                refreshCart();
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
        couponCode: coupon?.code || undefined,
        shippingAddressId: selectedAddressId,
        deliveryOption,
      });

      if (res.data.success && res.data.order?._id) {
        toastSuccess("Order placed successfully!");
        refreshCart();
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
        <div className="bg-white p-6 rounded-lg shadow max-w-xl">
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
          <div className="bg-white p-5 rounded-lg shadow">
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
                      className="w-16 h-16 rounded-lg object-cover border"
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
          <div className="bg-white p-5 rounded-lg shadow">
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
                  className="text-xs text-brand-ink hover:underline font-semibold"
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
                      className={`block border rounded-lg p-3 cursor-pointer transition-all ${
                        selectedAddressId === addr._id
                          ? "border-brand-600 bg-brand-50"
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
                        <span className="ml-2 text-[10px] bg-positive-tint text-positive px-1 rounded-lg">
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
        <div className="bg-white p-5 rounded-lg shadow h-fit sticky top-20">
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
                <span className="font-medium text-positive">
                  {shippingCharges === 0 ? 'Free' : `₹${shippingCharges}`}
                </span>
              )}
            </div>
          </div>

          {/* Only worth showing when there is a genuine choice to make. A
              single option is just the shipping line above, said twice. */}
          {deliveryOptions.length > 1 && (
            <div className="mt-4 border-t pt-3">
              <p className="text-sm font-medium text-gray-700 mb-2">
                Delivery speed
              </p>

              <div className="space-y-2">
                {deliveryOptions.map((option) => {
                  /*
                    A speed we intend to offer but cannot yet. It is announced
                    rather than hidden - a Jaipur customer learns this shop
                    means to deliver locally - but it is not a choice, so it
                    carries no radio, no price and no cursor. The server refuses
                    it independently; this is only the half a customer sees.

                    The row comes from the API, so the day same-day goes live it
                    is replaced by the real option and nobody has to remember to
                    take a promise down.
                  */
                  if (option.available === false) {
                    return (
                      <div
                        key={option.id}
                        aria-disabled="true"
                        className="flex items-start gap-3 rounded-lg border border-dashed
                                   border-gray-300 bg-gray-50 p-3"
                      >
                        <span className="flex-1">
                          <span className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="font-medium text-gray-500">
                              {option.label}
                            </span>
                            <span className="text-xs font-medium text-gray-500
                                             bg-gray-200 rounded-full px-2 py-0.5">
                              {option.note || 'Coming soon'}
                            </span>
                          </span>
                        </span>
                      </div>
                    );
                  }

                  return (
                    <label
                      key={option.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                        deliveryOption === option.id
                          ? 'border-brand-600 bg-brand-50'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="deliveryOption"
                        className="mt-1"
                        value={option.id}
                        checked={deliveryOption === option.id}
                        onChange={() => setDeliveryOption(option.id)}
                        disabled={calculatingTotals || placing}
                      />
                      <span className="flex-1">
                        <span className="flex justify-between">
                          <span className="font-medium text-gray-800">
                            {option.label}
                          </span>
                          <span className="font-medium text-gray-900">
                            {option.price === 0 ? 'Free' : `₹${option.price}`}
                          </span>
                        </span>
                        <span className="block text-xs text-gray-500">
                          {option.etaText}
                          {option.courier ? ` · ${option.courier}` : ''}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/*
            The coupon box.

            Sits above the total on purpose: a customer types a code to change
            the number below it, and a field placed after the total reads as an
            afterthought nobody uses.
          */}
          <div className="border-t pt-3 mt-3">
            {coupon ? (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-positive">
                    {coupon.code} applied
                  </p>
                  {coupon.description && (
                    <p className="text-xs text-gray-500">{coupon.description}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={removeCoupon}
                  className="text-xs text-gray-600 hover:underline shrink-0"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  value={couponInput}
                  onChange={(e) => {
                    setCouponInput(e.target.value.toUpperCase());
                    setCouponError(null);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && applyCoupon()}
                  placeholder="Coupon code"
                  aria-label="Coupon code"
                  className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm
                             tracking-wide focus:outline-none focus:ring-2 focus:ring-brand-fill"
                />
                <button
                  type="button"
                  onClick={applyCoupon}
                  disabled={!couponInput.trim() || checkingCoupon}
                  className="px-4 py-2 text-sm font-medium text-brand-ink border border-brand-600
                             rounded-lg hover:bg-brand-50 disabled:opacity-50 shrink-0"
                >
                  {checkingCoupon ? 'Checking…' : 'Apply'}
                </button>
              </div>
            )}

            {couponError && (
              <p className="text-xs text-red-600 mt-2">{couponError}</p>
            )}
          </div>

          {coupon && (
            <div className="flex justify-between text-sm mt-3">
              <span className="text-gray-600">Discount</span>
              <span className="text-positive tabular-nums">−{money(coupon.discount)}</span>
            </div>
          )}

          <div className="flex justify-between font-bold text-lg border-t pt-3 mt-3">
            <span>Order Total</span>
            <span className="text-brand-ink">
              {money(Math.max(0, grandTotal - (coupon?.discount || 0)))}
            </span>
          </div>

          <p className="text-xs text-gray-500 mt-2">
            This is the final amount including shipping. You will see the same
            total on the payment page.
          </p>

          {/* PAYMENT METHOD */}
          <div className="mt-4 mb-3">
            <h3 className="text-sm font-semibold mb-2">Payment Method</h3>

            <label className="flex items-center gap-2 mb-2 cursor-pointer p-2 border rounded-lg hover:bg-gray-50">
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

            <label className="flex items-center gap-2 cursor-pointer p-2 border rounded-lg hover:bg-gray-50">
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
            className="w-full mt-4 bg-brand-fill hover:bg-brand-fill-hover text-on-brand py-3 rounded-lg font-semibold disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {placing
              ? paymentMethod === "online"
                ? "Redirecting to payment..."
                : "Placing Order..."
              : paymentMethod === "online"
              ? `Pay ${money(Math.max(0, grandTotal - (coupon?.discount || 0)))} Online`
              : `Place Order (COD – ${money(
                  Math.max(0, grandTotal - (coupon?.discount || 0))
                )})`}
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
