const Address = require("../models/Address");

// ✅ ADD ADDRESS
exports.addAddress = async (req, res) => {
  try {
    const address = await Address.create({
      userId: req.user._id,
      ...req.body,
    });

    res.status(201).json({ success: true, address });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ GET MY ADDRESSES  ✅✅✅  (NAME FIXED)
exports.getMyAddresses = async (req, res) => {
  try {
    const addresses = await Address.find({ userId: req.user._id });
    res.json({ success: true, addresses });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ UPDATE ADDRESS
exports.updateAddress = async (req, res) => {
  try {
    const address = await Address.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    if (!address) {
      return res.status(404).json({ message: "Address not found" });
    }

    res.json({ success: true, address });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ DELETE ADDRESS
exports.deleteAddress = async (req, res) => {
  try {
    const address = await Address.findByIdAndDelete(req.params.id);

    if (!address) {
      return res.status(404).json({ message: "Address not found" });
    }

    res.json({ success: true, message: "Address deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
