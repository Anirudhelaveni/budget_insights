import { useState, useRef } from 'react';
import axios from 'axios';

function CSVUpload({ onUploadSuccess }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      // Validation: Ensure file is CSV
      if (selectedFile.type !== "text/csv" && !selectedFile.name.endsWith('.csv')) {
        alert("Please select a valid CSV file.");
        e.target.value = "";
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      alert("Please select a file first!");
      return;
    }
    
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      // Point to your backend endpoint (ideally via an environment variable)
      const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3000' : '';
      
      await axios.post(`${API_BASE}/api/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000 // 30 second timeout for large files
      });
      
      alert('File processed successfully!');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (onUploadSuccess) onUploadSuccess();
      
    } catch (err) {
      console.error("Upload error:", err);
      const msg = err.response?.data?.error || err.message || 'Upload failed.';
      alert(`Error: ${msg}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ margin: '20px 0', padding: '20px', border: '2px dashed #ccc', borderRadius: '8px', backgroundColor: '#f9f9f9' }}>
      <h3>Bulk Import Expenses (CSV)</h3>
      <p style={{ fontSize: '0.9em', color: '#666' }}>Headers required: <strong>Amount, Description</strong></p>
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".csv" style={{ marginRight: '10px' }} />
      <button onClick={handleUpload} disabled={uploading || !file} style={{ padding: '5px 15px' }}>
        {uploading ? 'Processing...' : 'Upload & Categorize'}
      </button>
    </div>
  );
}

export default CSVUpload;