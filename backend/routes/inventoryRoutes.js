const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");
const { getInventoryLogs } = require("../controllers/inventoryController");

// ✅ ADMIN + SELLER ONLY
router.use(authMiddleware);
router.use(roleMiddleware(["admin", "seller"]));

// ✅ GET INVENTORY LOGS → /api/inventory
router.get("/", getInventoryLogs);

module.exports = router;
