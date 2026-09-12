const dotenv = require('dotenv');
dotenv.config();
const connectDB = require("./Config/DatabaseConfig.js");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
connectDB();


const authRoutes = require("./Routes/AuthRoute");
const onboardingRoutes = require("./Routes/OnboardingRoute");
const accountRoutes = require("./Routes/AccountRoute");
const transactionRoutes = require("./Routes/TransactionRoute");
const app = express();

const PORT = process.env.PORT || 4500;

// SECURITY
app.use(helmet());
app.use(cors({origin: "*" }));

// BODY PARSING
app.use(express.json({limit: "1mb"}));
app.use(express.urlencoded({extended: true}));

// RATE LIMITING
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: {success: false, message:"Too many requests. Please try again later."}
});
app.use(limiter);

// HEALTH CHECK
app.get("/", (req, res) => {
    res.status(200).json({
      success: true,
      message: "KAA Bank API is running"
    });
});
app.get("/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "KAA Bank is healthy",
       timestamp: new Date().toISOString()
    });
});

// ROUTES
app.use( "/auth", authRoutes);
app.use( "/onboarding", onboardingRoutes);
app.use( "/account", accountRoutes);
app.use( "/transaction", transactionRoutes);

// 404
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "API endpoint not found"
    });
});

//ERROR HANDLER
app.use(
    (err, req, res, next) => {console.error( "Unhandled error:", err.message);
     res.status( err.status || 500).json({success: false, message: err.message || "Internal server error"});
    }
);

// START SERVER ONLY AFTER DATABASE CONNECTS

const startServer = async () => {
  await connectDB();
  app.listen(
        PORT, () => {console.log( `Server is running on port ${PORT}`);
          console.log( `http://localhost:${PORT}`);
        }
    );
};


startServer();