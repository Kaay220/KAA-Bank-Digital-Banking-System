const mongoose = require("mongoose");

const accountSchema = new mongoose.Schema(
    {
        customer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true,
            index: true
        },

        accountNumber: {
            type: String,
            required: true,
            unique: true,
            index: true,
            trim: true
        },

        accountName: {
            type: String,
            required: true,
            trim: true
        },

        bankCode: {
            type: String,
            required: true,
            trim: true
        },

        bankName: {
            type: String,
            required: true,
            trim: true
        },

        /*
         * Local balance used for the digital-bank ledger.
         *
         * The assignment's opening balance is ₦15,000.
         */
        balance: {
            type: Number,
            required: true,
            default: 15000,
            min: 0
        },

        currency: {
            type: String,
            default: "NGN",
            uppercase: true
        },

        status: {
            type: String,
            enum: [
                "ACTIVE",
                "BLOCKED",
                "CLOSED"
            ],
            default: "ACTIVE",
            index: true
        },

        /*
         * ID returned by Phoenix/NIBSS, if supplied.
         */
        providerAccountId: {
            type: String,
            default: null,
            trim: true
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model(
    "Account",
    accountSchema
);