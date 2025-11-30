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
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true
    }));

    // Routes
    const authRoutes = require('./routes/authRoutes');
    const adminRoutes = require('./routes/adminRoutes');
    const sellerRoutes = require('./routes/sellerRoutes');
    const customerRoutes = require('./routes/customerRoutes');
    app.get('/', (req, res) => {
    res.json({ message: ' ShopMaster Pro API is running!' });
    });

    app.use('/api/auth', authRoutes);
    app.use('/api/admin', adminRoutes);
    app.use('/api/seller', sellerRoutes);
    app.use('/api/customer', customerRoutes);
    // Simple 404
    app.use((req, res) => {
    res.status(404).json({ message: 'Route not found' });
    });

    const PORT = process.env.PORT || 5000;

    app.listen(PORT, () => {
    console.log(` Server running on port ${PORT}`);
    console.log(` API: http://localhost:${PORT}`);
    });
