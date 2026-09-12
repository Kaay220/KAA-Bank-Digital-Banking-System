const Account = require("../Models/Account");
const nibss = require("../Services/NibssServices");

// CREATE ACCOUNT
exports.createAccount = async (req, res) => {
    try {
        const user = req.user;
        if (
            !user.isVerified ||
            !user.kycType ||
            !user.kycID
        ) {
            return res.status(403).json({
                success: false,
                message: "Complete BVN or NIN verification before creating an account"
            });
        }
        const existingAccount = await Account.findOne({ customer: user._id});
        if (existingAccount) {
            return res.status(409).json({
                success: false,
                message: "Customer already has a bank account",
                account: {
                    accountNumber: existingAccount.accountNumber,
                    accountName: existingAccount.accountName,
                    balance: existingAccount.balance,
                    currency: existingAccount.currency,
                    status: existingAccount.status
                }
            });
        }
        /* Ask Phoenix/NIBSS to create the provider account*/
        const response = await nibss.createAccount({
            kycType: user.kycType,
            kycID: user.kycID,
            dob: user.dob
        });
        const nibssAccount =
        response.data?.account ||
        response.data?.data?.account ||
        response.data?.data ||
        null;
        if (
            !nibssAccount?.accountNumber
        ) {
            return res.status(502).json({
                success: false,
                message: "NIBSS did not return an account number"
            });
        }
        /*Registration Opening balance*/
        const openingBalance =
        Number(
            process.env.INITIAL_ACCOUNT_BALANCE ||
            15000
        );
        const account = await Account.create({
            customer: user._id,
            accountNumber: String( nibssAccount.accountNumber),
            accountName: nibssAccount.accountName || `${user.firstName} ${user.lastName}`,
            bankCode: nibssAccount.bankCode || process.env.BANK_CODE,
            bankName:nibssAccount.bankName || process.env.BANK_NAME || "KAA Bank",
            balance: Number.isFinite( openingBalance ) ? openingBalance: 15000,
            currency: "NGN",
            status: "ACTIVE",
            providerAccountId: nibssAccount.id || nibssAccount.accountId || null
        });
        return res.status(201).json({
            success: true,
            message: "Bank account created successfully",
            account: {
                id: account._id,
                accountNumber: account.accountNumber,
                accountName: account.accountName,
                bankCode: account.bankCode,
                bankName: account.bankName,
                balance: account.balance,
                currency: account.currency,
                status: account.status
            }
        });
    } catch (error) {
    console.error( "Account creation error:", error.message);
    /*MongoDB unique index caught a simultaneous account creation*/
    if ( error.code === 11000
    ) {return res.status(409).json({
        success: false,
        message: "Customer already has a bank account"
        });
    }
    return res.status( error.status || 500 ).json({
        success: false,
        message: "Account creation failed",
        error: error.message
    });
    }
};
// MY ACCOUNT
exports.getMyAccount = async (req, res) => {
    try {
        const account = await Account.findOne({ customer: req.user._id });
        if (!account) {
            return res.status(404).json({
                success: false,
                message: "Bank account not found"
            });
        }
        return res.status(200).json({
            success: true,
            message: "Account retrieved successfully", account
        }); 
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to retrieve account"
        });
    }
};
// LOCAL BALANCE
exports.getBalance = async (req, res) => {
    try {
        const account = await Account.findOne({ customer: req.user._id });
        if (!account) {
            return res.status(404).json({
                success: false,
                message: "Bank account not found"
            });
        }
        return res.status(200).json({
            success: true,
            message: "Balance retrieved successfully",
            accountNumber: account.accountNumber,
            accountName: account.accountName,
            balance: account.balance,
            currency: account.currency
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to retrieve balance"
        });
    }
};
// NIBSS BALANCE
exports.getProviderBalance = async (req, res) => {
    try {
        const account = await Account.findOne({ customer: req.user._id});
        if (!account) {
            return res.status(404).json({
                success: false,
                    message: "Bank account not found"
            });
        }
        const response = await nibss.getBalance( account.accountNumber);
        const result = response.data?.data || response.data?.account || response.data;
        if (
            result?.balance ===
            undefined
        ) {
            return res.status(502).json({
                success: false,
                message: "NIBSS did not return account balance"
            });
        }
        return res.status(200).json({
            success: true,
            message: "Provider balance retrieved successfully",
            accountNumber: account.accountNumber,
            balance: Number( result.balance),
            currency: "NGN"
        });
    } catch (error) {
        return res.status(
            error.status || 502
        ).json({
            success: false,
            message: "Failed to retrieve provider balance",
            error: error.message
        });
    }
};
// NAME ENQUIRY
exports.nameEnquiry = async (req, res) => {
    try {
        const { accountNumber} = req.params;
        if (
            !/^\d{10}$/.test( accountNumber || "" )
        ) {
            return res.status(400).json({
                success: false,
                message: "Account number must contain exactly 10 digits"
            });
        }
        /*Check our own database first*/
        const localAccount = await Account.findOne({ accountNumber, status: "ACTIVE"});
        if (localAccount) {
            return res.status(200).json({
                success: true,
                source: "LOCAL",
                account: {
                    accountNumber: localAccount.accountNumber,
                    accountName: localAccount.accountName,
                    bankCode: localAccount.bankCode,
                    bankName: localAccount.bankName
                }
            });
        }
        /*Otherwise query Phoenix/NIBSS*/
        const response = await nibss.nameEnquiry( accountNumber);
        const result = response.data?.data || response.data?.account || response.data;
        if (!result) {
            return res.status(404).json({
                success: false,
                message: "Recipient account not found"
            });
        }
        return res.status(200).json({
            success: true,
            source: "NIBSS",
            account: result

        });
    } catch (error) {
        return res.status(
            error.status || 502
        ).json({
            success: false,
            message: "Name enquiry failed",
            error: error.message
        });
    }
};