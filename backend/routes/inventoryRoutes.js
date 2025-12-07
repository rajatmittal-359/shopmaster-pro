const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");
const { getInventoryLogs } = require("../controllers/inventoryController");

// ✅ ADMIN + SELLER ONLY
router.use(authMiddleware, roleMiddleware(["admin", "seller"]));

router.get("/logs", getInventoryLogs);

module.exports = router;
