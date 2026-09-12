const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
    {
        customer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },

        transactionId: {
            type: String,
            required: true,
            unique: true,
            index: true,
            trim: true
        },

        from: {
            type: String,
            required: true,
            trim: true
        },

        to: {
            type: String,
            required: true,
            trim: true
        },

        amount: {
            type: Number,
            required: true,
            min: 0.01
        },

        direction: {
            type: String,
            enum: [
                "DEBIT",
                "CREDIT"
            ],
            required: true
        },

        recipientName: {
            type: String,
            default: null,
            trim: true
        },

        recipientBank: {
            type: String,
            default: null,
            trim: true
        },

        transferType: {
            type: String,
            enum: [
                "INTRA_BANK",
                "INTER_BANK"
            ],
            required: true
        },

        status: {
            type: String,
            enum: [
                "PENDING",
                "SUCCESS",
                "FAILED",
                "REVERSED"
            ],
            default: "PENDING",
            index: true
        },

        narration: {
            type: String,
            default: "",
            maxlength: 200
        },

        providerReference: {
            type: String,
            default: null,
            index: true
        },

        providerResponse: {
            type: mongoose.Schema.Types.Mixed,
            default: null
        }
    },
    {
        timestamps: true
    }
);

transactionSchema.index({
    customer: 1,
    createdAt: -1
});

module.exports = mongoose.model(
    "Transaction",
    transactionSchema
);