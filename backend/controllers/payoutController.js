/**
 * Seller settlements.
 *
 * Admin endpoints see and settle what every seller is owed. The seller endpoint
 * shows a seller their own earnings and history, and nothing about anyone else.
 *
 * All the money logic lives in utils/payout.js; this file is transport only.
 */
const mongoose = require('mongoose');

const Payout = require('../models/Payout');
const Seller = require('../models/Seller');
const Order = require('../models/Order');
const {
  getPayableSummary,
  createPayoutForSeller,
  markPayoutPaid,
  markPayoutFailed,
  RETURN_WINDOW_DAYS,
} = require('../utils/payout');

// ------------------------------------------------------------------ admin

/** What every seller is currently owed, largest first. */
exports.getPayableSellers = async (req, res) => {
  try {
    const rows = await getPayableSummary();

    res.json({
      success: true,
      returnWindowDays: RETURN_WINDOW_DAYS,
      totalPayable: Math.round(rows.reduce((n, r) => n + r.netPayable, 0) * 100) / 100,
      sellers: rows,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/** Settles everything currently owed to one seller. */
exports.createPayout = async (req, res) => {
  try {
    const { sellerId } = req.body;

    if (!mongoose.isValidObjectId(sellerId)) {
      return res.status(400).json({ success: false, message: 'Invalid seller id' });
    }

    const result = await createPayoutForSeller(sellerId, req.user._id);

    if (!result.ok) {
      return res.status(400).json({ success: false, message: result.reason });
    }

    res.status(201).json({ success: true, payout: result.payout });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/** Every payout, newest first, optionally filtered by seller or status. */
exports.listPayouts = async (req, res) => {
  try {
    const { sellerId, status } = req.query;
    const filter = {};
    if (sellerId && mongoose.isValidObjectId(sellerId)) filter.sellerId = sellerId;
    if (status) filter.status = status;

    const payouts = await Payout.find(filter)
      .populate('sellerId', 'name email')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.json({ success: true, count: payouts.length, payouts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/** Records that the bank transfer actually happened. */
exports.settlePayout = async (req, res) => {
  try {
    const { payoutId } = req.params;
    const { reference, notes } = req.body;

    if (!mongoose.isValidObjectId(payoutId)) {
      return res.status(400).json({ success: false, message: 'Invalid payout id' });
    }

    // A transfer without a reference cannot be reconciled against a bank
    // statement later, which is the whole point of recording it.
    if (!reference || !String(reference).trim()) {
      return res.status(400).json({
        success: false,
        message: 'A bank or UPI reference is required to mark a payout paid',
      });
    }

    const result = await markPayoutPaid(payoutId, {
      reference: String(reference).trim(),
      adminId: req.user._id,
      notes,
    });

    if (!result.ok) return res.status(409).json({ success: false, message: result.reason });

    res.json({ success: true, payout: result.payout });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/** Marks a transfer failed and puts its sales back in the payable pool. */
exports.failPayout = async (req, res) => {
  try {
    const { payoutId } = req.params;

    if (!mongoose.isValidObjectId(payoutId)) {
      return res.status(400).json({ success: false, message: 'Invalid payout id' });
    }

    const result = await markPayoutFailed(payoutId, {
      reason: req.body.reason,
      adminId: req.user._id,
    });

    if (!result.ok) return res.status(409).json({ success: false, message: result.reason });

    res.json({
      success: true,
      message: 'Payout marked failed; its sales are payable again',
      payout: result.payout,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ----------------------------------------------------------------- seller

/**
 * A seller's own earnings.
 *
 * Three numbers a seller actually needs: what has been paid, what is owed and
 * ready, and what is still inside the return window.
 */
exports.getMyEarnings = async (req, res) => {
  try {
    const sellerId = req.user._id;

    const [payable] = await getPayableSummary(sellerId);

    // Delivered but still inside the return window, plus sold-not-yet-delivered.
    const pipeline = [
      { $match: { paymentStatus: 'paid' } },
      { $unwind: '$items' },
      {
        $match: {
          'items.sellerId': new mongoose.Types.ObjectId(String(sellerId)),
          'items.status': { $ne: 'cancelled' },
          'items.payoutId': null,
        },
      },
      {
        $group: {
          _id: null,
          gross: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
          commission: { $sum: '$items.commissionAmount' },
          earning: { $sum: '$items.sellerEarning' },
          items: { $sum: 1 },
        },
      },
    ];
    const [unsettled] = await Order.aggregate(pipeline);

    const payouts = await Payout.find({ sellerId })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    const paidOut = payouts
      .filter((p) => p.status === 'paid')
      .reduce((n, p) => n + p.netPayable, 0);

    const readyNow = payable ? payable.netPayable : 0;
    const totalUnsettled = unsettled ? Math.round(unsettled.earning * 100) / 100 : 0;

    res.json({
      success: true,
      returnWindowDays: RETURN_WINDOW_DAYS,
      earnings: {
        // Already transferred.
        paidOut: Math.round(paidOut * 100) / 100,
        // Delivered, return window closed, awaiting the next transfer.
        readyForPayout: readyNow,
        // Sold but not yet payable: undelivered, or still returnable.
        pendingClearance: Math.round((totalUnsettled - readyNow) * 100) / 100,
        commissionCharged: unsettled ? Math.round(unsettled.commission * 100) / 100 : 0,
      },
      payouts,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * The seller's own bank details.
 *
 * The field existed on the model from the start but no endpoint ever wrote to
 * it, so it was unreachable - and a payout to a seller whose account number is
 * unknown is impossible. Deliberately NOT demanded at registration: real
 * marketplaces let a seller sign up and list first, and ask for bank details
 * before the money actually has to move.
 */
exports.getMyPayoutDetails = async (req, res) => {
  try {
    const profile = await Seller.findOne({ userId: req.user._id })
      .select('businessName gstNumber bankDetails')
      .lean();

    if (!profile) {
      return res.status(404).json({ success: false, message: 'No seller profile found' });
    }

    const bank = profile.bankDetails || {};
    const complete = !!(bank.accountNumber && bank.ifscCode && bank.accountHolderName);

    res.json({
      success: true,
      businessName: profile.businessName,
      gstNumber: profile.gstNumber || null,
      bankDetails: bank.accountNumber
        ? {
            // Never echo a full account number back over the wire.
            accountNumber: `XXXXXX${String(bank.accountNumber).slice(-4)}`,
            ifscCode: bank.ifscCode,
            accountHolderName: bank.accountHolderName,
          }
        : null,
      canReceivePayouts: complete,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/** Saves the account a seller wants to be paid into. */
exports.updateMyPayoutDetails = async (req, res) => {
  try {
    const { accountNumber, ifscCode, accountHolderName, gstNumber } = req.body;

    if (!accountNumber || !ifscCode || !accountHolderName) {
      return res.status(400).json({
        success: false,
        message: 'Account number, IFSC code and account holder name are all required',
      });
    }

    const update = {
      bankDetails: {
        accountNumber: String(accountNumber).trim(),
        ifscCode: String(ifscCode).trim().toUpperCase(),
        accountHolderName: String(accountHolderName).trim(),
      },
    };
    if (gstNumber !== undefined) update.gstNumber = String(gstNumber).trim().toUpperCase();

    const profile = await Seller.findOneAndUpdate({ userId: req.user._id }, update, {
      new: true,
      runValidators: true, // the model already validates IFSC and GST formats
    });

    if (!profile) {
      return res.status(404).json({ success: false, message: 'No seller profile found' });
    }

    res.json({ success: true, message: 'Payout details saved', canReceivePayouts: true });
  } catch (error) {
    // A bad IFSC or GST format surfaces here as a validation error.
    const message = error.errors
      ? Object.values(error.errors).map((e) => e.message).join('; ')
      : error.message;
    res.status(400).json({ success: false, message });
  }
};
