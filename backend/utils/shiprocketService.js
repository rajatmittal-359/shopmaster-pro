const axios = require('axios');

const SHIPROCKET_BASE_URL = 'https://apiv2.shiprocket.in/v1/external';

let cachedToken = null;
let tokenExpiresAt = 0;

async function getShiprocketToken() {
  const now = Date.now();

  if (cachedToken && now < tokenExpiresAt) {
    return cachedToken;
  }

  const email = process.env.SHIPROCKET_API_EMAIL;
  const password = process.env.SHIPROCKET_API_PASSWORD;

  if (!email || !password) {
    throw new Error('Shiprocket API credentials not configured');
  }

  const res = await axios.post(`${SHIPROCKET_BASE_URL}/auth/login`, {
    email,
    password,
  });

  const token = res.data.token;
  // 10 din valid, hum 9 din ka buffer le rahe
  tokenExpiresAt = now + 9 * 24 * 60 * 60 * 1000;
  cachedToken = token;

  return token;
}

async function getShippingRate({ deliveryPincode, weightKg, isCod }) {
  const token = await getShiprocketToken();

  const pickupPincode = process.env.SHIPROCKET_PICKUP_PINCODE;
  if (!pickupPincode) {
    throw new Error('Shiprocket pickup pincode not configured');
  }

  const res = await axios.get(
    `${SHIPROCKET_BASE_URL}/courier/serviceability`,
    {
      params: {
        pickup_postcode: pickupPincode,
        delivery_postcode: deliveryPincode,
        weight: weightKg,
        cod: isCod ? 1 : 0,
        // optional extras: mode, order_type etc.
      },
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return res.data;
}

module.exports = {
  getShippingRate,
};
