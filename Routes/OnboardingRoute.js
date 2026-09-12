const express = require("express");
const { onboardWithBvn, onboardWithNin} = require( "../Controllers/OnboardingController");
const { protect} = require( "../Middleware/authMiddleware");
const router = express.Router();


router.post( "/bvn", protect, onboardWithBvn);

router.post( "/nin", protect, onboardWithNin);


module.exports = router;