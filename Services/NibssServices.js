const axios = require("axios");

const nibssApi = axios.create({
    baseURL: process.env.NIBSS_BASE_URL, timeout: 30000,
    headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
    }
});
let cachedToken = null;
let tokenExpiresAt = 0;
// ERROR NORMALIZATION
const normalizeNibssError = (error) => {

    if (error.nibssError) {
        return error;
    }

    const providerMessage = error.response?.data?.message || error.response?.data?.error || error.response?.data?.errors?.[0]?.message;

    const message = providerMessage || error.message || "NIBSS service unavailable";

    const normalized = new Error(message);

    normalized.status = error.response?.status || 502;

    normalized.nibssError = true;

    normalized.providerResponse = error.response?.data || null;

    return normalized;
};
// GET TOKEN
const getNibssToken = async () => {

    if (
        cachedToken &&
        Date.now() < tokenExpiresAt
    ) {
        return cachedToken;
    }

    try {

        const response = await nibssApi.post("/api/auth/token",
            { apiKey:process.env.NIBSS_API_KEY, apiSecret: process.env.NIBSS_API_SECRET}
        );
        console.log("========== NIBSS TOKEN RESPONSE ==========");
        console.log("STATUS:", response.status);
        console.log("DATA:", response.data);
        console.log("HEADERS:", response.headers);
        console.log("==========================================");

        const token =
            response.data?.token ||
            response.data?.accessToken ||
            response.data?.data?.token;

        if (!token) {
            throw new Error(
                "NIBSS authentication did not return a token"
            );
        }

        cachedToken = token;

        /*
         * Refresh slightly before the
         * expected one-hour expiry.
         */
        tokenExpiresAt =
            Date.now() +
            55 * 60 * 1000;

        return cachedToken;

    } catch (error) {
        throw normalizeNibssError(error);
    }
};
// PROTECTED REQUEST
const protectedRequest = async (config, retry = true) => {
    try {
        const token = await getNibssToken();
        return await nibssApi({ ...config,
            headers: {
               ...config.headers,
                Authorization: `Bearer ${token}`
            }
        });
    } catch (error) {
    if ( retry && error.response?.status === 401 ) {
        cachedToken = null;
        tokenExpiresAt = 0;
        return protectedRequest( config, false);
    }
    throw normalizeNibssError( error);
    }
};
// BVN
exports.createBvn = async (data) => {
    return protectedRequest({ method: "POST", url: "/api/insertBvn", data});
};
exports.validateBvn = async (bvn) => {
    return protectedRequest({ method: "POST", url: "/api/validateBvn", data: {bvn}});
};
// NIN
exports.createNin = async (data) => {
    return protectedRequest({ method: "POST", url: "/api/insertNin", data });
};
exports.validateNin = async (nin) => {
    return protectedRequest({ method: "POST", url: "/api/validateNin", data: {nin}});
};
// ACCOUNT
exports.createAccount = async (data) => {
    return protectedRequest({ method: "POST", url: "/api/account/create", data });
};
exports.nameEnquiry = async (accountNumber) => {
 return protectedRequest({ method: "GET", url: `/api/account/name-enquiry/${encodeURIComponent(accountNumber)}`});
};
exports.getBalance = async (accountNumber) => {
    return protectedRequest({ method: "GET", url: `/api/account/balance/${encodeURIComponent(accountNumber)}`});
};
// TRANSFER
exports.transfer = async (data) => {
    return protectedRequest({ method: "POST", url: "/api/transfer", data });
};
// TRANSACTION STATUS
exports.transactionStatus = async (transactionId) => {
    return protectedRequest({ method: "GET", url: `/api/transaction/${encodeURIComponent(transactionId)}`});
};