// createAdmin.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');

dotenv.config();

const createAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const email = 'rajatmittal359@gmail.com';

    const existing = await User.findOne({ email });
    if (existing) {
      console.log('Admin already exists');
      process.exit(0);
    }

    const admin = await User.create({
      name: 'Admin User',
      email,
      password: '123456',   // PLAIN TEXT
      role: 'admin',
      isVerified: true,
    });

    console.log('Admin created:', admin.email);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

createAdmin();
