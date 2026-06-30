import { useEffect, useState } from 'react';
import axios from 'axios';
import { PieChart, Pie, BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { useNavigate } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';

export default function Dashboard() {
  const [expenses, setExpenses] = useState([]);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [editingId, setEditingId] = useState(null);
  
  // Filtering & Sorting State
  const [selectedMonth, setSelectedMonth] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'transaction_date', direction: 'desc' });
  
  // Navigation and View State
  const [activeTab, setActiveTab] = useState('dashboard');
  const [viewMode, setViewMode] = useState('pie');
  
  const navigate = useNavigate();
  const userId = localStorage.getItem('userId');
  const API_URL = "https://budget-backend-ebjy.onrender.com";

  const fetchExpenses = async () => {
    if (!userId) {
      navigate('/');
      return;
    }
    
    try {
      const res = await axios.get(`${API_URL}/api/expenses?userId=${userId}`);
      setExpenses(res.data);
    } catch (err) { 
      toast.error("Failed to load data.");
    }
  };

  useEffect(() => { fetchExpenses(); }, []);

  // --- CRUD OPERATIONS ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = { amount, description, category, userId };
      if (editingId) {
        await axios.put(`${API_URL}/api/expenses/${editingId}`, payload);
        toast.success("Expense updated!");
        setEditingId(null);
      } else {
        await axios.post(`${API_URL}/api/expenses`, payload);
        toast.success("Expense added!");
      }
      setAmount(''); setDescription(''); setCategory('');
      fetchExpenses();
    } catch (err) {
      toast.error("Something went wrong.");
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('userId', userId);
    
    toast.promise(
      axios.post(`${API_URL}/api/upload`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
      {
        loading: 'Uploading CSV...',
        success: 'Upload complete!',
        error: 'Upload failed.'
      }
    ).then(() => fetchExpenses());
  };

  const handleEdit = (exp) => {
    setEditingId(exp.id);
    setDescription(exp.description);
    setAmount(exp.amount);
    setCategory(exp.category || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    if (window.confirm("Delete this expense permanently?")) {
      try {
        await axios.delete(`${API_URL}/api/expenses/${id}`);
        toast.success("Expense deleted.");
        fetchExpenses();
      } catch (err) {
        toast.error("Failed to delete.");
      }
    }
  };

  // --- DATA PROCESSING (SEARCH, FILTER, SORT) ---
  const availableMonths = ['All', ...new Set(expenses.map(exp => {
    if (!exp.transaction_date) return 'Unknown Date';
    const d = new Date(exp.transaction_date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }))];

  let processedExpenses = expenses.filter(exp => {
    let monthMatch = true;
    if (selectedMonth !== 'All') {
      if (!exp.transaction_date) monthMatch = (selectedMonth === 'Unknown Date');
      else {
        const d = new Date(exp.transaction_date);
        monthMatch = (`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === selectedMonth);
      }
    }
    const searchMatch = exp.description.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        (exp.category && exp.category.toLowerCase().includes(searchTerm.toLowerCase()));
    
    return monthMatch && searchMatch;
  });

  processedExpenses.sort((a, b) => {
    let valA = a[sortConfig.key];
    let valB = b[sortConfig.key];
    if (sortConfig.key === 'amount') {
      valA = parseFloat(valA) || 0;
      valB = parseFloat(valB) || 0;
    }
    if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
    if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const exportToCSV = () => {
    if (processedExpenses.length === 0) return toast.error("No data to export.");
    const headers = ['Date', 'Description', 'Category', 'Amount'];
    const csvRows = [headers.join(',')];
    processedExpenses.forEach(exp => {
      const date = exp.transaction_date ? new Date(exp.transaction_date).toLocaleDateString() : 'N/A';
      const desc = `"${exp.description.replace(/"/g, '""')}"`; 
      const cat = exp.category || 'Other';
      const amt = parseFloat(exp.amount).toFixed(2);
      csvRows.push([date, desc, cat, amt].join(','));
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', `Budget_Export_${selectedMonth}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success("CSV Downloaded!");
  };

  const totalSpent = processedExpenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0);
  const avgExpense = processedExpenses.length > 0 ? (totalSpent / processedExpenses.length) : 0;
  const categoryTotals = processedExpenses.reduce((acc, exp) => {
    const cat = exp.category || 'Other';
    acc[cat] = (acc[cat] || 0) + parseFloat(exp.amount);
    return acc;
  }, {});
  const highestCategory = Object.keys(categoryTotals).length > 0 
    ? Object.keys(categoryTotals).reduce((a, b) => categoryTotals[a] > categoryTotals[b] ? a : b) 
    : 'N/A';
  const chartData = Object.keys(categoryTotals).map(key => ({ name: key, value: categoryTotals[key] })).filter(item => item.value > 0);
  const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

  const containerStyle = { background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)', minHeight: '100vh', fontFamily: "'Inter', system-ui, sans-serif", display: 'flex' };
  const cardStyle = { backgroundColor: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(10px)', padding: '25px', borderRadius: '16px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05), 0 8px 10px -6px rgba(0,0,0,0.01)', flex: 1 };
  const inputStyle = { padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', transition: 'border 0.2s', flex: 1 };
  const btnStyle = { padding: '10px 20px', backgroundColor: editingId ? '#f59e0b' : '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', transition: 'transform 0.1s, background-color 0.2s' };
  const thStyle = { padding: '15px 12px', color: '#475569', cursor: 'pointer', userSelect: 'none', borderBottom: '2px solid #e2e8f0' };
  const sidebarStyle = { width: '250px', backgroundColor: '#0f172a', color: 'white', display: 'flex', flexDirection: 'column' };
  const navItemStyle = (tab) => ({ padding: '20px', cursor: 'pointer', backgroundColor: activeTab === tab ? '#1e293b' : 'transparent', borderLeft: activeTab === tab ? '4px solid #3b82f6' : '4px solid transparent', transition: '0.2s' });

  return (
    <div style={containerStyle}>
      <Toaster position="bottom-right" />
      <aside style={sidebarStyle}>
        <div style={{ padding: '30px 20px', fontSize: '20px', fontWeight: 'bold', borderBottom: '1px solid #334155', marginBottom: '20px' }}>💎 Budget Insights</div>
        <div style={navItemStyle('home')} onClick={() => setActiveTab('home')}>🏠 Home</div>
        <div style={navItemStyle('dashboard')} onClick={() => setActiveTab('dashboard')}>📊 Dashboard</div>
        <div style={navItemStyle('support')} onClick={() => setActiveTab('support')}>🎧 Support</div>
        <div style={{ marginTop: 'auto', padding: '20px' }}>
          <button onClick={() => { localStorage.removeItem('userId'); navigate('/'); }} style={{ width: '100%', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '10px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>Sign Out</button>
        </div>
      </aside>

      <main style={{ flex: 1, height: '100vh', overflowY: 'auto', paddingBottom: '50px' }}>
        <nav style={{ backgroundColor: 'white', padding: '15px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
          <h2 style={{ margin: 0, color: '#0f172a' }}>{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h2>
        </nav>

        <div style={{ maxWidth: '1300px', margin: '0 auto', padding: '0 20px' }}>
          {activeTab === 'home' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={cardStyle}><h1>Welcome to Budget Insights! 👋</h1><p style={{ color: '#64748b', fontSize: '18px' }}>We are thrilled to help you take control of your finances.</p></div>
            </div>
          )}
          {activeTab === 'support' && (
            <div style={cardStyle}><h1>Need Help?</h1><ul style={{ listStyle: 'none', padding: 0 }}><li>📧 support@budgetinsights.com</li><li>📞 +91 9491143778</li></ul></div>
          )}
          {activeTab === 'dashboard' && (
            <>
              <div style={{ display: 'flex', gap: '20px', marginBottom: '30px', flexWrap: 'wrap' }}>
                <div style={{ ...cardStyle, borderTop: '4px solid #3b82f6' }}><h2>Total Spent: ${totalSpent.toFixed(2)}</h2></div>
                <div style={{ ...cardStyle, borderTop: '4px solid #10b981' }}><h2>Highest: {highestCategory}</h2></div>
                <div style={{ ...cardStyle, borderTop: '4px solid #f59e0b' }}><h2>Average: ${avgExpense.toFixed(2)}</h2></div>
              </div>
              <div style={cardStyle}>
                <div style={{ display: 'flex', gap: '5px', marginBottom: '10px' }}>
                  <button onClick={() => setViewMode('pie')}>Pie</button>
                  <button onClick={() => setViewMode('bar')}>Bar</button>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  {viewMode === 'pie' ? <PieChart><Pie data={chartData} dataKey="value" nameKey="name" label>{chartData.map((e,i) => <Cell key={i} fill={COLORS[i%COLORS.length]}/>)}</Pie><Tooltip /><Legend /></PieChart> : <BarChart data={chartData}><XAxis dataKey="name"/><YAxis/><Tooltip/><Bar dataKey="value" fill="#2563eb"/></BarChart>}
                </ResponsiveContainer>
              </div>
              <div style={{...cardStyle, marginTop: '20px'}}>
                <form onSubmit={handleSubmit} style={{display: 'flex', gap: '10px', marginBottom: '20px'}}>
                  <input style={inputStyle} value={description} placeholder="Description" onChange={(e) => setDescription(e.target.value)} required />
                  <input style={inputStyle} type="number" value={amount} placeholder="$" onChange={(e) => setAmount(e.target.value)} required />
                  <button type="submit" style={btnStyle}>{editingId ? "Update" : "Add"}</button>
                </form>
                <input type="file" onChange={handleFileUpload} />
                <button onClick={exportToCSV}>📥 CSV</button>
                <table style={{ width: '100%' }}>
                  <thead><tr><th style={thStyle} onClick={() => handleSort('transaction_date')}>Date</th><th style={thStyle} onClick={() => handleSort('description')}>Description</th><th style={thStyle} onClick={() => handleSort('category')}>Category</th><th style={thStyle} onClick={() => handleSort('amount')}>Amount</th><th>Actions</th></tr></thead>
                  <tbody>{processedExpenses.map(exp => <tr key={exp.id}><td>{new Date(exp.transaction_date).toLocaleDateString()}</td><td>{exp.description}</td><td>{exp.category}</td><td>${parseFloat(exp.amount).toFixed(2)}</td><td><button onClick={() => handleEdit(exp)}>✏️</button><button onClick={() => handleDelete(exp.id)}>🗑️</button></td></tr>)}</tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}