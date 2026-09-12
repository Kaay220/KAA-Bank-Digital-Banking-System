const express = require("express");
const { createAccount, getMyAccount, getBalance, getProviderBalance, nameEnquiry} = require( "../Controllers/AccountController");
const { protect} = require( "../Middleware/authMiddleware");
const router = express.Router();

router.post("/create", protect, createAccount);
router.get( "/me", protect, getMyAccount);
router.get( "/balance", protect, getBalance);
router.get( "/provider-balance", protect, getProviderBalance);
router.get( "/name-enquiry/:accountNumber", protect, nameEnquiry);


module.exports = router;