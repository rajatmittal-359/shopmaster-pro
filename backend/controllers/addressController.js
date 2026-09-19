const mongoose = require("mongoose");
const Address = require("../models/Address");

// Fields a customer is allowed to set. userId is deliberately excluded so it
// can never be supplied or rewritten by the client.
const EDITABLE_FIELDS = [
  "label",
  "phoneNumber",
  "street",
  "landmark",
  "city",
  "state",
  "zipCode",
  "country",
  "isDefault",
];

const pickEditable = (body = {}) =>
  EDITABLE_FIELDS.reduce((acc, key) => {
    if (body[key] !== undefined) acc[key] = body[key];
    return acc;
  }, {});

// ✅ ADD ADDRESS
exports.addAddress = async (req, res) => {
  try {
    // Whitelisted, and userId is set from the authenticated session only.
    // Previously req.body was spread AFTER userId, letting a client assign the
    // address to another user.
    // PIN code known to India Post, state taken from it, phone as ten digits (utils/addressCheck).
    const checked = await require('../utils/addressCheck').checkAddress(pickEditable(req.body));
    if (checked.error) return res.status(400).json({ message: checked.error });
    const address = await Address.create({
      ...checked.value,
      userId: req.user._id,
    });

    res.status(201).json({ success: true, address });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ GET MY ADDRESSES
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
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid address id" });
    }

    // Scoped to the authenticated customer. Previously findByIdAndUpdate()
    // matched on _id alone, so any customer could edit any address.
    const checked = await require('../utils/addressCheck').checkAddress(pickEditable(req.body));
    if (checked.error) return res.status(400).json({ message: checked.error });
    const address = await Address.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      checked.value,
      { new: true, runValidators: true }
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
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid address id" });
    }

    // Scoped to the authenticated customer, as above.
    const address = await Address.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!address) {
      return res.status(404).json({ message: "Address not found" });
    }

    res.json({ success: true, message: "Address deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
