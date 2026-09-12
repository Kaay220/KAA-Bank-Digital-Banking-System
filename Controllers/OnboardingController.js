const User = require("../Models/User");
const nibss = require("../Services/NibssServices");

// HELPERS
const normalizeDate = (value) => {
   if (!value) {
        return null;
    }
    return String(value)
    .split("T")[0]
    .trim();
};
const normalizeName = (value) => {
    return String(value || "")
    .trim()
    .toLowerCase();
};
const extractProviderData = (response) => {
    return (
        response?.data?.data ||
        response?.data?.response ||
        response?.data?.account ||
        response?.data ||
        null
    );
};
// BVN
exports.onboardWithBvn = async (req, res) => {
    try {
        const user = req.user;
        const {bvn} = req.body;
        if (user.isVerified) {
            return res.status(400).json({
                success: false,
                message: "Customer has already completed verification"
            });
        }
        if (
            !bvn ||
            !/^\d{11}$/.test(
             String(bvn)
            )
        )
        {
            return res.status(400).json({
                success: false,
                message: "BVN must contain exactly 11 digits"
            });
        }
        /*
        * Register/test the BVN with Phoenix*/
        await nibss.createBvn({
            bvn: String(bvn),
            firstName: user.firstName,
            lastName: user.lastName,
            dob: user.dob,
            phone: user.phone
        });
        /*Validate against Phoenix*/
        const validation = await nibss.validateBvn( String(bvn));
        const identity = extractProviderData( validation);
        if (!identity) {
            return res.status(400).json({
                success: false,
                message: "BVN verification failed"
            });
        }
        const returnedBvn = identity.bvn;
        if (
            returnedBvn &&
            String(returnedBvn) !==
            String(bvn)
        ) {
            return res.status(400).json({
                success: false,
                message: "BVN returned by provider does not match submitted BVN"
            });
        }
        const namesMatch =
            normalizeName(
                identity.firstName
            ) ===
            normalizeName(
                user.firstName
            ) &&
            normalizeName(
                identity.lastName
            ) ===
            normalizeName(
                user.lastName
            );
        const providerDob = normalizeDate( identity.dob);
        const customerDob = normalizeDate( user.dob );
        if (
            providerDob &&
            providerDob !== customerDob
        ) {
            return res.status(400).json({
                success: false,
                message: "BVN date of birth does not match customer details"
            });
        }
       if (
            identity.firstName &&
            identity.lastName &&
            !namesMatch
        ) {
            return res.status(400).json({
              success: false,
              message: "BVN identity does not match customer details"
            });
        }

        user.kycType = "bvn";
        user.kycID = String(bvn);
        user.isVerified = true;

        await user.save();

        return res.status(200).json({
           success: true,
            message: "BVN onboarding and verification successful",
            verified: true,
            kycType: "bvn"
        });

    } catch (error) {
    console.error( "BVN onboarding error:", error.message );
    return res.status(
        error.status || 502
    ).json({ success: false, message: "BVN onboarding failed", error: error.message});
    }
};
// NIN
exports.onboardWithNin = async (req, res) => {
    try {
        const user = req.user;
        const {nin} = req.body;
        if (user.isVerified) {
            return res.status(400).json({
                success: false,
                message: "Customer has already completed verification"
            });
        }
        if (
            !nin ||
            !/^\d{11}$/.test(
                String(nin)
            )
        ) {
            return res.status(400).json({
                success: false,
                message: "NIN must contain exactly 11 digits"
            });
        }
        await nibss.createNin({
            nin: String(nin),
            firstName: user.firstName,
            lastName: user.lastName,
            dob: user.dob,
            phone: user.phone
        });
        const validation = await nibss.validateNin( String(nin));
        const identity = extractProviderData(validation);
        if (!identity) {
            return res.status(400).json({
                success: false,
                message: "NIN verification failed"
            });
        }
        if (
            identity.nin &&
            String(identity.nin) !==
            String(nin)
        ) {
            return res.status(400).json({
                success: false,
                message: "NIN returned by provider does not match submitted NIN"
            });
        }
        const namesMatch =
        normalizeName(
            identity.firstName
        ) ===
        normalizeName(
            user.firstName
        ) &&
        normalizeName(
            identity.lastName
        ) ===
        normalizeName(
            user.lastName
        );
        const providerDob = normalizeDate(identity.dob);
        const customerDob = normalizeDate(user.dob);
        if (
            providerDob &&
            providerDob !== customerDob
        ) {
            return res.status(400).json({
                success: false,
                message: "NIN date of birth does not match customer details"
            });
        }
        if (
            identity.firstName &&
            identity.lastName &&
            !namesMatch
        ) {
            return res.status(400).json({
                success: false,
                message: "NIN identity does not match customer details"
            });
        }
        user.kycType = "nin";
        user.kycID = String(nin);
        user.isVerified = true;
        await user.save();
        return res.status(200).json({
            success: true,
            message: "NIN onboarding and verification successful",
            verified: true,
            kycType: "nin"
        });

    } catch (error) {
    console.error( "NIN onboarding error:", error.message);
    return res.status(
        error.status || 502 ).json({
            success: false,
            message: "NIN onboarding failed",
            error: error.message
        });
    }
};