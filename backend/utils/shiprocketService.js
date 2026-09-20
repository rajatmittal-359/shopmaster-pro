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

    /**
     * The courier's rate card for one parcel. `opts.pickupPincode` is the
     * seller's own pickup (utils/shipping quotes per seller since 21 Sep
     * 2026); without it the house shop's env pincode is the origin.
     */
    async function getShippingRate(deliveryPincode, weightKg, isCod, opts = {}) {
    try {
        const token = await getShiprocketToken();
        const pickupPincode = opts.pickupPincode || process.env.SHIPROCKET_PICKUP_PINCODE;
        if (!pickupPincode)
        throw new Error('Shiprocket pickup pincode not configured');

        const res = await axios.get(
        `${SHIPROCKET_BASE_URL}/courier/serviceability`,
        {
            params: {
            pickup_postcode: pickupPincode,
            delivery_postcode: deliveryPincode,
            weight: weightKg,
            cod: isCod ? 1 : 0,
            },
            headers: { Authorization: `Bearer ${token}` },
        }
        );

        return res.data;
    } catch (err) {
        console.error(
        'SHIPROCKET SERVICE ERROR:',
        err.response?.status,
        err.response?.data || err.message
        );
        throw err;
    }
    }
    // backend/utils/shiprocketService.js

    function pickBestCourier(data) {
    const companies = data?.data?.available_courier_companies || [];

    if (!companies.length) return null;

    // Simple: sabse kam rate wala courier
    let best = companies[0];

    for (const c of companies) {
        if (typeof c.rate === 'number' && c.rate < best.rate) {
        best = c;
        }
    }

    return best;
    }

    module.exports = {
    getShippingRate,
    pickBestCourier,
    };


