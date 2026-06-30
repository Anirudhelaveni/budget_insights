const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const upload = multer({ dest: 'uploads/' });

app.post('/api/upload', upload.single('file'), (req, res) => {
  const results = [];
  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on('data', (data) => results.push(data))
    .on('end', async () => {
      // Loop through results and insert into DB
      for (const row of results) {
        await pool.query(
          "INSERT INTO Expenses (user_id, amount, description) VALUES ($1, $2, $3)",
          [1, row.Amount, row.Description]
        );
      }
      res.send('File processed and data saved!');
      fs.unlinkSync(req.file.path); // Clean up the uploaded file
    });
});