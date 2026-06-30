const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  password: 'anirudh', // Put the password here directly
  host: 'localhost',
  port: 5433,
  database: 'budget_insights'
});

module.exports = pool;