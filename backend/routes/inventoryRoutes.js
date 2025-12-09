const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");
const { getInventoryLogs } = require("../controllers/inventoryController");


router.use(authMiddleware);
router.use(roleMiddleware(["admin", "seller"]));

router.get("/", getInventoryLogs);

module.exports = router;
