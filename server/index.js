const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const bcrypt = require('bcrypt');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());

// STRICT CONFIGURATION (Local + Production)
// Ensure you replace 'anirudh' with your actual local database password if it changes
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:anirudh@localhost:5433/budget_insights',
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Helper: Auto-Categorization
const categorize = (desc) => {
  if (!desc) return 'Other';
  const d = desc.toLowerCase();
  if (d.includes('netflix') || d.includes('amazon') || d.includes('spotify')) return 'Entertainment';
  if (d.includes('grocery') || d.includes('walmart') || d.includes('food') || d.includes('target')) return 'Groceries';
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
  } catch (err) { 
    console.error("REGISTRATION ERROR:", err.message);
    res.status(500).json({ error: err.message }); 
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (user.rows.length === 0) return res.status(401).json({ error: "User not found" });
    
    const valid = await bcrypt.compare(password, user.rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: "Invalid password" });
    
    res.json({ userId: user.rows[0].id });
  } catch (err) { 
    console.error("LOGIN ERROR:", err.message);
    res.status(500).json({ error: err.message }); 
  }
});

// --- EXPENSE ROUTES ---

// 1. GET all expenses (NEW: Filtered by userId)
app.get('/api/expenses', async (req, res) => {
  const { userId } = req.query; // Capture the userId sent from the frontend
  
  if (!userId) {
    return res.status(400).json({ error: "User ID is required" });
  }

  try {
    // Only fetch records where the user_id matches
    const allExpenses = await pool.query(
      "SELECT * FROM expenses WHERE user_id = $1 ORDER BY transaction_date DESC NULLS LAST, id DESC",
      [userId]
    );
    res.json(allExpenses.rows);
  } catch (err) { 
    console.error("GET EXPENSES ERROR:", err.message);
    res.status(500).json({ error: err.message }); 
  }
});

// 2. POST manual expense (NEW: Attaches userId to the record)
app.post('/api/expenses', async (req, res) => {
  const { amount, description, category, userId } = req.body;
  
  if (!userId) return res.status(400).json({ error: "User ID is required" });
  
  const finalCategory = category || categorize(description); 
  
  try {
    await pool.query(
      "INSERT INTO expenses (amount, description, category, transaction_date, user_id) VALUES ($1, $2, $3, CURRENT_DATE, $4)",
      [amount, description, finalCategory, userId]
    );
    res.status(201).json({ message: "Expense added manually" });
  } catch (err) {
    console.error("MANUAL ADD ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// 3. PUT update existing expense (NEW: Ensures the user owns the record they are updating)
app.put('/api/expenses/:id', async (req, res) => {
  const { id } = req.params;
  const { amount, description, category, userId } = req.body;
  
  if (!userId) return res.status(400).json({ error: "User ID is required" });

  const finalCategory = category || categorize(description); 
  
  try {
    await pool.query(
      "UPDATE expenses SET amount = $1, description = $2, category = $3 WHERE id = $4 AND user_id = $5",
      [amount, description, finalCategory, id, userId]
    );
    res.json({ message: "Expense updated successfully" });
  } catch (err) {
    console.error("UPDATE ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// 4. DELETE an expense
app.delete('/api/expenses/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // Safely delete by the specific expense ID
    await pool.query("DELETE FROM expenses WHERE id = $1", [id]);
    res.json({ message: "Expense deleted successfully" });
  } catch (err) {
    console.error("DELETE ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// 5. POST CSV Upload (NEW: Attaches userId to every uploaded row)
app.post('/api/upload', upload.single('file'), (req, res) => {
  const userId = req.body.userId; // Extract userId sent via FormData
  
  if (!userId) return res.status(400).send("User ID is required for upload.");

  const results = [];
  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on('data', (data) => results.push(data))
    .on('end', async () => {
      try {
        for (const row of results) {
          const amt = row.Amount || row.amount || 0; 
          const desc = row.Description || row.description || 'Unknown';
          const category = categorize(desc);

          await pool.query(
            "INSERT INTO expenses (amount, description, category, transaction_date, user_id) VALUES ($1, $2, $3, CURRENT_DATE, $4)",
            [amt, desc, category, userId]
          );
        }
        res.send('Bulk upload successful!');
      } catch (err) { 
        console.error("UPLOAD ERROR:", err.message);
        res.status(500).send(err.message); 
      }
      finally { fs.unlinkSync(req.file.path); }
    });
});

// Deployment-ready Port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));