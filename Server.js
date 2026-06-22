require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || "*"
}));

const BASE_URL = "https://sandbox.momodeveloper.mtn.com";
const TARGET_ENV = process.env.MOMO_TARGET_ENV || "sandbox";

const API_USER = process.env.MOMO_API_USER;
const API_KEY = process.env.MOMO_API_KEY;
const SUB_KEY = process.env.MOMO_SUBSCRIPTION_KEY;

const TRANSACTIONS_FILE = path.join(__dirname, "transactions.json");

function loadTransactions() {
  if (!fs.existsSync(TRANSACTIONS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(TRANSACTIONS_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveTransaction(referenceId, data) {
  const all = loadTransactions();
  all[referenceId] = {
    ...all[referenceId],
    ...data,
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(TRANSACTIONS_FILE, JSON.stringify(all, null, 2));
}

// GET TOKEN
async function getToken() {
  const res = await axios.post(
    `${BASE_URL}/collection/token/`,
    {},
    {
      auth: {
        username: API_USER,
        password: API_KEY
      },
      headers: {
        "Ocp-Apim-Subscription-Key": SUB_KEY
      }
    }
  );
  return res.data.access_token;
}

function isValidPhone(phone) {
  return typeof phone === "string" && /^[0-9]{9,15}$/.test(phone);
}

function isValidAmount(amount) {
  const n = Number(amount);
  return !isNaN(n) && n > 0;
}

// PAYMENT ENDPOINT
app.post("/pay", async (req, res) => {
  try {
    const { phone, amount, orderId } = req.body;

    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: "Invalid phone number" });
    }
    if (!isValidAmount(amount)) {
      return res.status(400).json({ error: "Invalid amount" });
    }
    if (!orderId) {
      return res.status(400).json({ error: "orderId is required" });
    }

    const token = await getToken();

    const payment = {
      amount: String(amount),
      currency: "UGX",
      externalId: orderId,
      payer: {
        partyIdType: "MSISDN",
        partyId: phone
      },
      payerMessage: "Javani Farms Order",
      payeeNote: "Agricultural goods"
    };

    await axios.post(
      `${BASE_URL}/collection/v1_0/requesttopay`,
      payment,
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          "X-Reference-Id": orderId,
          "X-Target-Environment": TARGET_ENV,
          "Ocp-Apim-Subscription-Key": SUB_KEY,
          "Content-Type": "application/json"
        }
      }
    );

    // NOTE: this confirms MTN ACCEPTED the request, not that the customer paid.
    // Use GET /status/:referenceId (below) to check the real outcome.
    saveTransaction(orderId, {
      phone,
      amount,
      status: "PENDING"
    });

    res.json({
      success: true,
      message: "Payment request sent. Awaiting customer confirmation.",
      referenceId: orderId
    });

  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "Payment failed to initiate" });
  }
});

// STATUS CHECK ENDPOINT — poll this to see if the customer actually paid
app.get("/status/:referenceId", async (req, res) => {
  try {
    const { referenceId } = req.params;
    const token = await getToken();

    const result = await axios.get(
      `${BASE_URL}/collection/v1_0/requesttopay/${referenceId}`,
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          "X-Target-Environment": TARGET_ENV,
          "Ocp-Apim-Subscription-Key": SUB_KEY
        }
      }
    );

    saveTransaction(referenceId, { status: result.data.status });

    res.json(result.data);

  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "Could not fetch payment status" });
  }
});

// OPTIONAL CALLBACK — MTN can POST here if you set X-Callback-Url on requesttopay,
// or configure a webhook in the MoMo developer portal. Needs a public URL to work.
app.post("/momo-callback", (req, res) => {
  console.log("MoMo callback received:", req.body);
  const referenceId = req.body.externalId || req.body.referenceId;
  if (referenceId) {
    saveTransaction(referenceId, {
      status: req.body.status,
      callbackPayload: req.body
    });
  }
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
