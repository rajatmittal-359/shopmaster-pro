    const express = require('express');
    const dotenv = require('dotenv');
    const cors = require('cors');
    const connectDB = require('./config/db');

    dotenv.config();
    connectDB();

    const app = express();

    // Middleware
    app.use(express.json());
app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://shopmaster-pro.onrender.com"
  ],
  credentials: false
}));
    // Routes imports
    const authRoutes = require('./routes/authRoutes');
    const adminRoutes = require('./routes/adminRoutes');
    const sellerRoutes = require('./routes/sellerRoutes');
    const customerRoutes = require('./routes/customerRoutes');
    const productRoutes = require('./routes/productRoutes'); // ← yeh line add
    const reviewRoutes = require('./routes/reviewRoutes');

    app.get('/', (req, res) => {
      res.json({ message: ' ShopMaster Pro API is running!' });
    });

    // Mount routes
    app.use('/api/auth', authRoutes);
    app.use('/api/admin', adminRoutes);
    app.use('/api/seller', sellerRoutes);
    app.use('/api/customer', customerRoutes);
    app.use('/api/public/products', productRoutes); // ← yeh line add
    app.use('/api/reviews', reviewRoutes);
    app.use("/api/inventory", require("./routes/inventoryRoutes"));

    // Simple 404
    app.use((req, res) => {
      res.status(404).json({ message: 'Route not found' });
    });

    const PORT = process.env.PORT || 5000;

    app.listen(PORT, () => {
      console.log(` Server running on port ${PORT}`);
    });
