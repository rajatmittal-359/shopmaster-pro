const Address = require('../models/Address');

// GET /api/customer/addresses
exports.getAddresses = async (req, res) => {
  try {
    const addresses = await Address.find({ userId: req.user._id })
      .sort({ isDefault: -1, createdAt: -1 });
    
    res.json({ count: addresses.length, addresses });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/customer/addresses
exports.addAddress = async (req, res) => {
  try {
    const { label, street, city, state, zipCode, country, isDefault } = req.body;

    if (!street || !city || !state || !zipCode) {
      return res.status(400).json({ 
        message: 'Street, city, state, and zipCode are required' 
      });
    }

    // If setting as default, unset all other defaults
    if (isDefault) {
      await Address.updateMany(
        { userId: req.user._id },
        { isDefault: false }
      );
    }

    const address = await Address.create({
      userId: req.user._id,
      label: label || 'Home',
      street,
      city,
      state,
      zipCode,
      country: country || 'India',
      isDefault: isDefault || false,
    });

    res.status(201).json({ message: 'Address added successfully', address });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/customer/addresses/:id
exports.updateAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const { label, street, city, state, zipCode, country, isDefault } = req.body;

    const address = await Address.findOne({ _id: id, userId: req.user._id });
    
    if (!address) {
      return res.status(404).json({ 
        message: 'Address not found or access denied' 
      });
    }

    // If setting as default, unset others
    if (isDefault && !address.isDefault) {
      await Address.updateMany(
        { userId: req.user._id, _id: { $ne: id } },
        { isDefault: false }
      );
    }

    if (label !== undefined) address.label = label;
    if (street !== undefined) address.street = street;
    if (city !== undefined) address.city = city;
    if (state !== undefined) address.state = state;
    if (zipCode !== undefined) address.zipCode = zipCode;
    if (country !== undefined) address.country = country;
    if (isDefault !== undefined) address.isDefault = isDefault;

    await address.save();
    
    res.json({ message: 'Address updated successfully', address });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// DELETE /api/customer/addresses/:id
exports.deleteAddress = async (req, res) => {
  try {
    const { id } = req.params;

    const address = await Address.findOneAndDelete({ 
      _id: id, 
      userId: req.user._id 
    });
    
    if (!address) {
      return res.status(404).json({ 
        message: 'Address not found or access denied' 
      });
    }

    res.json({ message: 'Address deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
