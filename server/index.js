const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const bcrypt = require('bcrypt');
const { GoogleGenerativeAI } = require("@google/generative-ai"); // Added AI library

const app = express();
const upload = multer({ dest: 'uploads/' });

// Allow your Vercel frontend URL to talk to this backend
app.use(cors({
  origin: ["http://localhost:5173", "https://budget-insights-beta.vercel.app"]
}));
app.use(express.json());

// STRICT CONFIGURATION
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:anirudh@localhost:5433/budget_insights',
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// AI Configuration
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY);

// Helper: Auto-Categorization (Fallback if AI fails)
const categorize = (desc) => {
  if (!desc) return 'Other';
  const d = desc.toLowerCase();
  if (d.includes('netflix') || d.includes('amazon') || d.includes('spotify')) return 'Entertainment';
  if (d.includes('grocery') || d.includes('walmart') || d.includes('food') || d.includes('target')) return 'Food';
  if (d.includes('uber') || d.includes('gas') || d.includes('fuel')) return 'Transportation';
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

// --- AI CLASSIFICATION ROUTE ---
app.post('/api/classify', async (req, res) => {
  const { description } = req.body;
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `Categorize this transaction description: "${description}" into one of: Income, Housing, Food, Transportation, Entertainment, Shopping, Utilities, Other. Return ONLY the category name.`;
    const result = await model.generateContent(prompt);
    res.json({ category: result.response.text().trim() });
  } catch (err) {
    console.error("AI Error:", err);
    res.status(500).json({ error: "AI classification failed" });
  }
});

// --- EXPENSE ROUTES ---
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

// CSV Upload
app.post('/api/upload', upload.single('file'), (req, res) => {
  const userId = req.body.userId;
  const results = [];
  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on('data', (data) => results.push(data))
    .on('end', async () => {
      try {
        for (const row of results) {
          const amt = row.Amount || row.amount || 0;
          const desc = row.Description || row.description || 'Unknown';
          const cat = categorize(desc);
          await pool.query("INSERT INTO expenses (amount, description, category, transaction_date, user_id) VALUES ($1, $2, $3, CURRENT_DATE, $4)", [amt, desc, cat, userId]);
        }
        res.send('Bulk upload successful!');
      } catch (err) { res.status(500).send(err.message); }
      finally { fs.unlinkSync(req.file.path); }
    });
});

// Database Setup
const setupDatabase = async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, email VARCHAR(255) UNIQUE NOT NULL, password_hash VARCHAR(255) NOT NULL);`);
  await pool.query(`CREATE TABLE IF NOT EXISTS expenses (id SERIAL PRIMARY KEY, amount DECIMAL(10,2) NOT NULL, description VARCHAR(255) NOT NULL, category VARCHAR(50), transaction_date DATE, user_id INTEGER REFERENCES users(id));`);
};

setupDatabase().then(() => {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});