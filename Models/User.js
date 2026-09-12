const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        firstName: {
            type: String,
            required: true,
            trim: true,
            maxlength: 50
        },

        lastName: {
            type: String,
            required: true,
            trim: true,
            maxlength: 50
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            index: true
        },

        password: {
            type: String,
            required: true,
            select: false
        },

        phone: {
            type: String,
            required: true,
            trim: true
        },

        dob: {
            type: String,
            required: true,
            trim: true
        },

        kycType: {
            type: String,
            enum: ["bvn", "nin", null],
            default: null
        },

        /*KYC ID is deliberately hidden from normal MongoDB queries and JSON responses*/
        kycID: {
            type: String,
            default: null,
            select: false
        },

        isVerified: {
            type: Boolean,
            default: false,
            index: true
        }
    },
    {
        timestamps: true
    }
);

userSchema.set("toJSON", {
    transform: function (doc, ret) {
        delete ret.password;
        delete ret.kycID;

        return ret;
    }
});

module.exports = mongoose.model(
    "User",
    userSchema
);