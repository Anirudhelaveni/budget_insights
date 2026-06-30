const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const bcrypt = require('bcrypt');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const upload = multer({ dest: 'uploads/' });

// --- MIDDLEWARE ---
app.use(cors({
  origin: ["http://localhost:5173", "https://budget-insights-beta.vercel.app"]
}));
app.use(express.json());

// --- DATABASE CONFIGURATION ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:anirudh@localhost:5433/budget_insights',
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// --- GOOGLE AI SETUP ---
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
const delay = ms => new Promise(res => setTimeout(res, ms));

// Helper: Fast Rule-Based Categorization (Saves AI costs)
const categorize = (desc) => {
  if (!desc) return 'Other';
  const d = desc.toLowerCase();
  if (d.includes('netflix') || d.includes('amazon') || d.includes('spotify')) return 'Entertainment';
  if (d.includes('grocery') || d.includes('walmart') || d.includes('food') || d.includes('target') || d.includes('swiggy') || d.includes('zomato')) return 'Food';
  if (d.includes('uber') || d.includes('gas') || d.includes('fuel') || d.includes('ola')) return 'Transportation';
  if (d.includes('salary') || d.includes('upi')) return 'Income';
  return 'Other';
};

// --- AUTH ROUTES ---
app.post('/api/register', async (req, res) => {
  const { email, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query("INSERT INTO users (email, password_hash) VALUES ($1, $2)", [email, hashedPassword]);
    res.status(201).json({ message: "User registered" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (user.rows.length === 0) return res.status(401).json({ error: "User not found" });
    const valid = await bcrypt.compare(password, user.rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: "Invalid password" });
    res.json({ userId: user.rows[0].id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- SETU ACCOUNT AGGREGATOR (INDIA) ROUTES ---

// 1. Create Consent Request (Triggered by Frontend Button)
app.post('/api/setu/create_consent', async (req, res) => {
  const { userPhoneNumber } = req.body;
  
  const payload = {
    Detail: {
      consentStart: new Date().toISOString(),
      consentExpiry: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString(), // Expires in 1 month
      Customer: { id: `${userPhoneNumber}@setu-aa` },
      FIDataRange: {
        from: new Date(new Date().setMonth(new Date().getMonth() - 6)).toISOString(), // Fetch last 6 months
        to: new Date().toISOString()
      },
      DataLife: { unit: "MONTH", value: 6 },
      DataConsumer: { type: "FIU" },
      Purpose: {
        code: "101",
        refUri: "https://api.rebit.org.in/message/ref/item/101",
        text: "Expense Tracking and Categorization"
      },
      fiTypes: ["DEPOSIT"] // Requesting Bank Account Statements
    }
  };

  try {
    const response = await axios.post('https://fiu-sandbox.setu.co/consents', payload, {
      headers: {
        'x-client-id': process.env.SETU_CLIENT_ID,
        'x-client-secret': process.env.SETU_CLIENT_SECRET,
        'x-product-instance-id': process.env.SETU_PRODUCT_INSTANCE_ID
      }
    });
    
    res.json({ url: response.data.url, consentId: response.data.ConsentHandle });
  } catch (error) {
    console.error("Setu Consent Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to create Indian Bank consent request" });
  }
});

// 2. Webhook Listener (Setu pings this when user approves on their phone)
app.post('/api/setu/webhook', async (req, res) => {
  const { type, data } = req.body;

  // Acknowledge receipt immediately so Setu doesn't retry
  res.status(200).send('OK');

  if (type === 'CONSENT_STATUS_UPDATE' && data.status === 'ACTIVE') {
    const consentId = data.ConsentHandle;
    console.log(`Consent ${consentId} approved! Fetching data...`);
    
    // Trigger data fetch asynchronously 
    initiateSetuDataFetch(consentId);
  }
});

// 3. Data Fetch Logic (Pulls data & uses Gemini AI to categorize)
const initiateSetuDataFetch = async (consentId) => {
  try {
    // A. Request Data Session
    const sessionRes = await axios.post('https://fiu-sandbox.setu.co/sessions', {
      consentId: consentId,
      DataRange: {
        from: new Date(new Date().setMonth(new Date().getMonth() - 6)).toISOString(),
        to: new Date().toISOString()
      },
      format: "JSON"
    }, {
      headers: {
        'x-client-id': process.env.SETU_CLIENT_ID,
        'x-client-secret': process.env.SETU_CLIENT_SECRET
      }
    });

    const sessionId = sessionRes.data.id;
    await delay(3000); // Wait for Setu to prepare the data packet

    // B. Download the Data
    const dataRes = await axios.get(`https://fiu-sandbox.setu.co/sessions/${sessionId}/data`, {
      headers: {
        'x-client-id': process.env.SETU_CLIENT_ID,
        'x-client-secret': process.env.SETU_CLIENT_SECRET
      }
    });

    const rawPayload = dataRes.data.Payload;
    if (!rawPayload || rawPayload.length === 0) return;

    // Note: We need a userId to save expenses. In a production app, you would map the 
    // consentId to the userId in your database when the consent was created.
    // For this boilerplate, we'll assume a generic fallback or require mapping.
    
    /* // C. Process through AI and save to DB
      for (const account of rawPayload) {
        for (const txn of account.data.transactions) {
          const desc = txn.narration || "Unknown Transaction";
          const amt = txn.amount || 0;
          const date = txn.transactionTimestamp || new Date();
          
          let cat = categorize(desc);
          if (cat === 'Other') {
            await delay(1000); // Respect Gemini Limits
            const prompt = `Classify "${desc}" into: Income, Housing, Food, Transportation, Entertainment, Shopping, Utilities, Other. Return ONLY the category name.`;
            const aiResult = await model.generateContent(prompt);
            cat = aiResult.response.text().trim();
          }

          // Save to PostgreSQL (Requires mapping consentId to userId)
          // await pool.query("INSERT INTO expenses (amount, description, category, transaction_date, user_id) VALUES ($1, $2, $3, $4, $5)", [amt, desc, cat, date, mappedUserId]);
        }
      }
    */
    console.log("Data successfully fetched and ready for processing.");

  } catch (error) {
    console.error("Setu Data Fetch Error:", error.response?.data || error.message);
  }
};

// --- SINGLE AI CLASSIFICATION ROUTE (Frontend Modal) ---
app.post('/api/classify', async (req, res) => {
  const { description } = req.body;
  try {
    const prompt = `Categorize this transaction description: "${description}" into one of: Income, Housing, Food, Transportation, Entertainment, Shopping, Utilities, Other. Return ONLY the category name.`;
    const result = await model.generateContent(prompt);
    res.json({ category: result.response.text().trim() });
  } catch (err) {
    res.status(500).json({ error: "AI classification failed" });
  }
});

// --- EXPENSE CRUD ROUTES ---
app.get('/api/expenses', async (req, res) => {
  const { userId } = req.query;
  try {
    const allExpenses = await pool.query("SELECT * FROM expenses WHERE user_id = $1 ORDER BY transaction_date DESC", [userId]);
    res.json(allExpenses.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/expenses', async (req, res) => {
  const { amount, description, category, userId } = req.body;
  const finalCategory = category || categorize(description);
  try {
    await pool.query("INSERT INTO expenses (amount, description, category, transaction_date, user_id) VALUES ($1, $2, $3, CURRENT_DATE, $4)", [amount, description, finalCategory, userId]);
    res.status(201).json({ message: "Expense added" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/expenses/:id', async (req, res) => {
  const { id } = req.params;
  const { amount, description, category, userId } = req.body;
  try {
    await pool.query("UPDATE expenses SET amount = $1, description = $2, category = $3 WHERE id = $4 AND user_id = $5", [amount, description, category, id, userId]);
    res.json({ message: "Updated" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/expenses/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM expenses WHERE id = $1", [id]);
    res.json({ message: "Deleted" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- AI BATCH CSV UPLOAD ---
app.post('/api/upload', upload.single('file'), (req, res) => {
  const userId = req.body.userId;
  const results = [];
  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on('data', (data) => results.push(data))
    .on('end', async () => {
      try {
        for (const row of results) {
          const rawAmt = row.Amount || row.amount || 0;
          const desc = (row.Description || row.description || 'Unknown').trim();
          let cat = categorize(desc);
          
          if (cat === 'Other') {
            await delay(1000); // Respect Gemini Limits
            const prompt = `Classify "${desc}" into: Income, Housing, Food, Transportation, Entertainment, Shopping, Utilities, Other. Return ONLY the category name.`;
            const result = await model.generateContent(prompt);
            cat = result.response.text().trim();
          }

          // Strip currency symbols and save
          const amt = parseFloat(rawAmt.toString().replace(/[^0-9.-]+/g,""));
          await pool.query("INSERT INTO expenses (amount, description, category, transaction_date, user_id) VALUES ($1, $2, $3, CURRENT_DATE, $4)", [amt, desc, cat, userId]);
        }
        res.send('Bulk upload successful with AI classification!');
      } catch (err) { res.status(500).send(err.message); }
      finally { fs.unlinkSync(req.file.path); }
    });
});

// --- DATABASE SETUP ---
const setupDatabase = async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, email VARCHAR(255) UNIQUE NOT NULL, password_hash VARCHAR(255) NOT NULL);`);
  
  // Add columns for India's Account Aggregator context (Safe to run multiple times)
  try { await pool.query(`ALTER TABLE users ADD COLUMN setu_consent_id VARCHAR(255);`); } catch (err) {}
  
  await pool.query(`CREATE TABLE IF NOT EXISTS expenses (id SERIAL PRIMARY KEY, amount DECIMAL(10,2) NOT NULL, description VARCHAR(255) NOT NULL, category VARCHAR(50), transaction_date DATE, user_id INTEGER REFERENCES users(id));`);
};

setupDatabase().then(() => {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});