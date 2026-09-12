const crypto = require("crypto");
const mongoose = require("mongoose");
const Account = require("../Models/Account");
const Transaction = require("../Models/Transaction");
const nibss = require("../Services/NibssServices");

// REFERENCE
const generateReference = () => {
    return (
        "TXN-" +
        Date.now() +
        "-" +
        crypto
        .randomBytes(5)
        .toString("hex")
        .toUpperCase()
    );
};
// TRANSFER
exports.transfer = async (req, res) => {
    try {
        const { to, amount, narration = "" } = req.body;

        // INPUT
        if (
            !to ||
            amount === undefined
        ) {
            return res.status(400).json({
                success: false,
                message: "Recipient account and amount are required"
            });
        }
       if (
            !/^\d{10}$/.test( String(to) )
        ) {
            return res.status(400).json({
                success: false,
                message: "Recipient account must contain exactly 10 digits"
            });
        }
        const numericAmount = Number(amount);
        if (
            !Number.isFinite(
                numericAmount
            ) ||
            numericAmount <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Transfer amount must be greater than zero"
            });
        }
        if (
            numericAmount >
            100000000
        ) {
            return res.status(400).json({
                success: false,
                message: "Transfer amount exceeds allowed limit"
            });
        }
        // SENDER
        const senderAccount = await Account.findOne({ customer: req.user._id, status: "ACTIVE" });
        if (!senderAccount) {
            return res.status(404).json({
                success: false,
                message: "Sender bank account not found"
            });
        }
       if (
           senderAccount.accountNumber ===
           String(to)
        ) {
            return res.status(400).json({
                success: false,
                message: "You cannot transfer money to your own account"
            });
        }
        // NAME ENQUIRY
        let recipient;
        let localRecipient = null;
        localRecipient = await Account.findOne({ accountNumber: String(to), status: "ACTIVE"});
        if (localRecipient) {
            recipient = {
                accountNumber: localRecipient.accountNumber,
                accountName: localRecipient.accountName,
                bankCode: localRecipient.bankCode,
                bankName: localRecipient.bankName
            };
        } else {
            const enquiryResponse = await nibss.nameEnquiry( String(to));
            recipient = enquiryResponse.data?.data || enquiryResponse.data?.account || enquiryResponse.data;
            if (!recipient) {
                return res.status(404).json({
                    success: false,
                    message: "Recipient account could not be verified"
                });
            }
        }
        const recipientName = recipient.accountName || recipient.name || recipient.account_name;
        const recipientBank = recipient.bankName || recipient.bank || null;
        const recipientBankCode = recipient.bankCode || recipient.bank_code || null;
        if (!recipientName) {
            return res.status(400).json({
                success: false,
                message: "Unable to verify recipient name"
            });
        }
        // TRANSFER TYPE
        const transferType = localRecipient ? "INTRA_BANK": "INTER_BANK";

        // INTRA BANK
        if (
            transferType ===
            "INTRA_BANK"
        ) {
           const session = await mongoose.startSession();
            let debitTransaction;
            let creditTransaction;
            try {
                await session.withTransaction( async () => {
                    const reference = generateReference();
                    /*Automic balance deduction*/
                    const updatedSender = await Account.findOneAndUpdate(
                        {
                            _id: senderAccount._id,
                            status: "ACTIVE",
                            balance: { $gte: numericAmount}
                        },
                        { 
                            $inc: { balance: -numericAmount}
                        },
                        {
                            new: true, session
                        }
                    );
                    if (!updatedSender) { throw new Error("Insufficient funds");}
                    /*Credit recipient*/
                    await Account.findOneAndUpdate(
                        {
                            _id: localRecipient._id,
                            status: "ACTIVE"
                        },
                        {
                            $inc: { balance: numericAmount}
                        },
                        {
                            new: true, session
                        }
                    );
                    const transactionData = {
                        transactionId: reference,
                        from: senderAccount.accountNumber,
                        to: localRecipient.accountNumber,
                        amount: numericAmount, recipientName,
                        recipientBank: localRecipient.bankName,
                        transferType: "INTRA_BANK",
                        status: "SUCCESS", narration,
                        providerReference: null
                    };
                    [ debitTransaction ] = await Transaction.create(
                        [
                            { ...transactionData, customer: req.user._id, direction: "DEBIT" }
                        ],
                        { session }
                    );
                    [ creditTransaction ] = await Transaction.create(
                        [
                            { ...transactionData, customer: localRecipient.customer, direction: "CREDIT"}
                        ],
                        { session }
                    );
                }
                );
            } finally {
                await session.endSession();
            }
            return res.status(200).json({
                success: true,
                message: "Intra-bank transfer successful",
                transaction: { 
                    transactionId: debitTransaction.transactionId,
                    from: debitTransaction.from,
                    to: debitTransaction.to,
                    amount: debitTransaction.amount,
                    recipientName: debitTransaction.recipientName,
                    recipientBank: debitTransaction.recipientBank,
                    transferType: debitTransaction.transferType,
                    status: debitTransaction.status,
                    createdAt: debitTransaction.createdAt
                }
            });
        }
        
        // INTER BANK
        /*Check local balance before calling external provider*/
        if (
            senderAccount.balance <
            numericAmount
        ) {
            return res.status(400).json({
                success: false,
                message: "Insufficient funds",
                availableBalance: senderAccount.balance
            });
        }
        const reference = generateReference();
        /*Create pending transaction first*/
        const pendingTransaction = await Transaction.create({
            customer: req.user._id,
            transactionId: reference,
            from: senderAccount.accountNumber,
            to: String(to),
            amount: numericAmount,
            direction: "DEBIT", recipientName, recipientBank,
            transferType: "INTER_BANK",
            status: "PENDING", narration
        });
        try {
            const transferResponse = await nibss.transfer({
                from: senderAccount.accountNumber,
                to: String(to),
                amount: String( numericAmount), narration
            });
            const transferData = transferResponse.data?.data || transferResponse.data?.transaction || transferResponse.data;
            const providerReference = transferData?.reference || transferData?.transactionId || transferData?.transactionReference || null;
            const providerStatus = String( transferData?.status || "" ).toUpperCase();
            const successful = providerStatus === "SUCCESS" || providerStatus === "SUCCESSFUL" || transferData?.success === true;
            
            if (!successful) {
                pendingTransaction.status = "PENDING";
                pendingTransaction.providerReference = providerReference;
                pendingTransaction.providerResponse = transferData;
                await pendingTransaction.save();
                return res.status(202).json({
                    success: true,
                    message: "Transfer submitted and is pending",
                    transaction: {
                        transactionId: pendingTransaction.transactionId,
                        status: pendingTransaction.status,
                        amount: pendingTransaction.amount, recipientName, recipientBank,
                        transferType: pendingTransaction.transferType
                    }
                });
            }
            /* Provider says SUCCESS and Automically deduct our local balance*/
            const updatedSender = await Account.findOneAndUpdate(
                {
                    _id: senderAccount._id,
                    status: "ACTIVE",
                    balance: { $gte: numericAmount}
                },
                {
                    $inc: { balance: -numericAmount}
                },
                { new: true }
            );
            if (!updatedSender) {
                /*This is an exceptional state: provider says success but our local ledger cannot debit */
                pendingTransaction.status = "SUCCESS";
                pendingTransaction.providerReference = providerReference;
                pendingTransaction.providerResponse = transferData;
                await pendingTransaction.save();
                return res.status(200).json({
                    success: true,
                    message: "Transfer succeeded at provider; local ledger requires reconciliation",
                    transaction: pendingTransaction
                });
            }
            pendingTransaction.status = "SUCCESS";
            pendingTransaction.providerReference = providerReference;
            pendingTransaction.providerResponse = transferData;
            await pendingTransaction.save();
            return res.status(200).json({
                success: true,
                message: "Inter-bank transfer successful",
                transaction: {
                    transactionId: pendingTransaction.transactionId,
                    from: pendingTransaction.from,
                    to: pendingTransaction.to,
                    amount: pendingTransaction.amount,
                    recipientName: pendingTransaction.recipientName,
                    recipientBank: pendingTransaction.recipientBank,
                    transferType: pendingTransaction.transferType,
                    status: pendingTransaction.status,
                    createdAt: pendingTransaction.createdAt
                }
            });
        } catch (providerError) {
            pendingTransaction.status = "FAILED";
            pendingTransaction.providerResponse = providerError.providerResponse || providerError.message;
            await pendingTransaction.save();
            return res.status(
                providerError.status || 502
            ).json({
                success: false,
                message: "Inter-bank transfer failed",
                transaction: {
                    transactionId: pendingTransaction.transactionId,
                    status: pendingTransaction.status
                }
            });
        }
    } catch (error) {
        console.error( "Transfer error:", error.message);
        if (
            error.message ===
            "Insufficient funds"
        ) {
            return res.status(400).json({
                success: false,
                message: "Insufficient funds"
            });
        }
        return res.status( error.status || 500).json({
            success: false,
            message: "Transfer failed",
            error: error.message
        });
    }
};
// HISTORY
exports.getMyTransactions = async (req, res) => {
    try {
        const page = Math.max( Number( req.query.page ) || 1, 1);
        const limit = Math.min( Math.max( Number( req.query.limit ) || 20, 1), 100);
        const skip = (page - 1) * limit;
        const filter = {customer: req.user._id};
        const [ transactions, total] = await Promise.all([
            Transaction
            .find(filter)
            .sort({ createdAt: -1})
            .skip(skip)
            .limit(limit)
            .lean(),
            Transaction
            .countDocuments(filter)
        ]);
        return res.status(200).json({
            success: true,
            message: "Transaction history retrieved successfully", page, limit, total, pages: Math.ceil( total / limit), transactions
        });
    } catch (error) {
        console.error( "Transaction history error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Failed to retrieve transaction history"
        });
    }
};

// TRANSACTION STATUS
exports.getTransactionStatus = async (req, res) => {
    try {
        const { transactionId} = req.params;
        /*IMPORTANT: customer + transactionId prevents one customer from reading another customer's transaction*/
        const transaction = await Transaction.findOne({ transactionId, customer: req.user._id});
        if (!transaction) {
            return res.status(404).json({
                success: false,
                message: "Transaction not found"
            });
        }
        /*If this is an external transaction, ask Phoenix/NIBSS for the latest state*/
        if (
            transaction.providerReference ||
            transaction.transferType ===
            "INTER_BANK"
        ) {
            try {
                const response = await nibss.transactionStatus( transaction.providerReference || transaction.transactionId);
                const result = response.data?.data || response.data?.transaction || response.data;
                if ( result?.status) {
                    transaction.status = String( result.status).toUpperCase();
                }
                transaction.providerResponse = result || transaction.providerResponse;
                await transaction.save();
            } catch (providerError) {
                /*Don't erase the local transaction simply because the status service temporarily failed*/
                console.error( "Provider status lookup failed:", providerError.message);
            }
        }
        return res.status(200).json({
            success: true,
            message: "Transaction status retrieved successfully",
            transaction: {
                transactionId: transaction.transactionId,
                from: transaction.from,
                to: transaction.to,
                amount: transaction.amount,
                direction: transaction.direction,
                recipientName: transaction.recipientName,
                recipientBank: transaction.recipientBank,
                transferType: transaction.transferType,
                status: transaction.status,
                createdAt: transaction.createdAt,
                updatedAt: transaction.updatedAt
            }
        });
    } catch (error) {
        console.error( "Transaction status error:", error.message);
        return res.status( error.status || 500).json({
            success: false,
            message: "Failed to retrieve transaction status", error: error.message
        });
    }
};