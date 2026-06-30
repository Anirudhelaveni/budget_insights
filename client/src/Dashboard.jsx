import { useEffect, useState } from 'react';
import axios from 'axios';
import { PieChart, Pie, BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { useNavigate } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
const API_URL = "https://budget-backend-ebjy.onrender.com";
// Then use it like this:
await axios.get(`${API_URL}/api/expenses?userId=${userId}`);

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
  
  // NEW: Navigation and View State
  const [activeTab, setActiveTab] = useState('dashboard');
  const [viewMode, setViewMode] = useState('pie'); // 'pie' or 'bar'
  
  const navigate = useNavigate();
  // NEW: Grab the logged-in user's ID
  const userId = localStorage.getItem('userId');

  const fetchExpenses = async () => {
    // Prevent unauthenticated access
    if (!userId) {
      navigate('/');
      return;
    }
    
    try {
      // Pass userId to only fetch this specific user's data
      const res = await axios.get(`http://localhost:3000/api/expenses?userId=${userId}`);
      setExpenses(res.data);
    } catch (err) { 
      toast.error("Failed to load data.");
    }
  };

  useEffect(() => { fetchExpenses(); }, []);

  // --- CRUD OPERATIONS WITH TOASTS ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // Include userId in the payload so the backend knows who owns this expense
      const payload = { amount, description, category, userId };
      if (editingId) {
        await axios.put(`http://localhost:3000/api/expenses/${editingId}`, payload);
        toast.success("Expense updated!");
        setEditingId(null);
      } else {
        await axios.post('http://localhost:3000/api/expenses', payload);
        toast.success("Expense added!");
      }
      setAmount('');
      setDescription('');
      setCategory('');
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
    formData.append('userId', userId); // Ensure uploaded CSVs belong to this user
    
    toast.promise(
      axios.post('http://localhost:3000/api/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
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
        await axios.delete(`http://localhost:3000/api/expenses/${id}`);
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

  // --- CSV EXPORT ---
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

  // --- CALCULATIONS ---
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

  // --- UI STYLES ---
  const containerStyle = { 
    background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)', 
    minHeight: '100vh', 
    fontFamily: "'Inter', system-ui, sans-serif",
    display: 'flex' // Changed to flex for sidebar layout
  };
  const cardStyle = { 
    backgroundColor: 'rgba(255, 255, 255, 0.9)', 
    backdropFilter: 'blur(10px)',
    padding: '25px', 
    borderRadius: '16px', 
    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05), 0 8px 10px -6px rgba(0,0,0,0.01)', 
    flex: 1 
  };
  const inputStyle = { padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', transition: 'border 0.2s', flex: 1 };
  const btnStyle = { padding: '10px 20px', backgroundColor: editingId ? '#f59e0b' : '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', transition: 'transform 0.1s, background-color 0.2s' };
  const thStyle = { padding: '15px 12px', color: '#475569', cursor: 'pointer', userSelect: 'none', borderBottom: '2px solid #e2e8f0' };

  // SIDEBAR STYLES
  const sidebarStyle = { width: '250px', backgroundColor: '#0f172a', color: 'white', display: 'flex', flexDirection: 'column' };
  const navItemStyle = (tab) => ({ padding: '20px', cursor: 'pointer', backgroundColor: activeTab === tab ? '#1e293b' : 'transparent', borderLeft: activeTab === tab ? '4px solid #3b82f6' : '4px solid transparent', transition: '0.2s' });

  return (
    <div style={containerStyle}>
      <Toaster position="bottom-right" />
      
      {/* NEW SIDEBAR */}
      <aside style={sidebarStyle}>
        <div style={{ padding: '30px 20px', fontSize: '20px', fontWeight: 'bold', borderBottom: '1px solid #334155', marginBottom: '20px' }}>
          💎 Budget Insights
        </div>
        <div style={navItemStyle('home')} onClick={() => setActiveTab('home')}>🏠 Home</div>
        <div style={navItemStyle('dashboard')} onClick={() => setActiveTab('dashboard')}>📊 Dashboard</div>
        <div style={navItemStyle('support')} onClick={() => setActiveTab('support')}>🎧 Support</div>
        
        <div style={{ marginTop: 'auto', padding: '20px' }}>
          <button onClick={() => { localStorage.removeItem('userId'); navigate('/'); }} style={{ width: '100%', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '10px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>
            Sign Out
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main style={{ flex: 1, height: '100vh', overflowY: 'auto', paddingBottom: '50px' }}>
        
        {/* TOP NAVBAR (Kept existing header functionality) */}
        <nav style={{ backgroundColor: 'white', padding: '15px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
          <h2 style={{ margin: 0, color: '#0f172a' }}>{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h2>
        </nav>

        <div style={{ maxWidth: '1300px', margin: '0 auto', padding: '0 20px' }}>
          
         {/* TAB: HOME (Upgraded Checklist) */}
          {activeTab === 'home' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={cardStyle}>
                <h1 style={{ marginTop: 0, color: '#0f172a' }}>Welcome to Budget Insights! 👋</h1>
                <p style={{ color: '#64748b', fontSize: '18px', marginBottom: 0 }}>We are thrilled to help you take control of your finances. Here is how to get started:</p>
              </div>
              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                <div style={{ ...cardStyle, borderTop: '4px solid #3b82f6', flex: 1 }}>
                  <h3 style={{ marginTop: 0, color: '#1e293b' }}>1️⃣ Add an Expense</h3>
                  <p style={{ color: '#64748b' }}>Go to the Dashboard tab and manually add a recent transaction to see your charts update instantly.</p>
                </div>
                <div style={{ ...cardStyle, borderTop: '4px solid #10b981', flex: 1 }}>
                  <h3 style={{ marginTop: 0, color: '#1e293b' }}>2️⃣ Upload a CSV</h3>
                  <p style={{ color: '#64748b' }}>Save time by uploading your bank statements directly using the Bulk Upload tool.</p>
                </div>
                <div style={{ ...cardStyle, borderTop: '4px solid #f59e0b', flex: 1 }}>
                  <h3 style={{ marginTop: 0, color: '#1e293b' }}>3️⃣ Track Progress</h3>
                  <p style={{ color: '#64748b' }}>Check your Spending Breakdown charts regularly to ensure you stay within your limits.</p>
                </div>
              </div>
            </div>
          )}

         {/* TAB: SUPPORT (Fixed Bullet Alignment) */}
          {activeTab === 'support' && (
            <div style={cardStyle}>
              <h1 style={{ marginTop: 0, color: '#0f172a' }}>Need Help?</h1>
              <p style={{ color: '#64748b', fontSize: '18px' }}>If you are experiencing issues, please contact our support team:</p>
              
              {/* FIXED: listStyle: 'none' removes the ugly HTML bullets, padding: 0 aligns it left */}
              <ul style={{ listStyle: 'none', padding: 0, fontSize: '16px', lineHeight: '2.2', color: '#334155' }}>
                <li>📧 <strong>Email:</strong> support@budgetinsights.com</li>
                <li>📞 <strong>Phone:</strong> +91 9491143778</li>
                <li>🕒 <strong>Hours:</strong> Mon-Fri, 9am - 5pm EST</li>
              </ul>
            </div>
          )}

          {/* TAB: DASHBOARD (Your completely untouched dashboard code wrapped here) */}
          {activeTab === 'dashboard' && (
            <>
              {/* SUMMARY CARDS */}
              <div style={{ display: 'flex', gap: '20px', marginBottom: '30px', flexWrap: 'wrap' }}>
                <div style={{ ...cardStyle, borderTop: '4px solid #3b82f6', textAlign: 'center' }}>
                  <p style={{ margin: 0, color: '#64748b', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold' }}>Total Spent</p>
                  <h2 style={{ margin: '10px 0 0 0', color: '#0f172a', fontSize: '36px' }}>${totalSpent.toFixed(2)}</h2>
                </div>
                <div style={{ ...cardStyle, borderTop: '4px solid #10b981', textAlign: 'center' }}>
                  <p style={{ margin: 0, color: '#64748b', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold' }}>Highest Category</p>
                  <h2 style={{ margin: '10px 0 0 0', color: '#0f172a', fontSize: '32px' }}>{highestCategory}</h2>
                </div>
                <div style={{ ...cardStyle, borderTop: '4px solid #f59e0b', textAlign: 'center' }}>
                  <p style={{ margin: 0, color: '#64748b', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold' }}>Average Expense</p>
                  <h2 style={{ margin: '10px 0 0 0', color: '#0f172a', fontSize: '36px' }}>${avgExpense.toFixed(2)}</h2>
                </div>
              </div>

              {/* ACTIONS ROW */}
              <div style={{ display: 'flex', gap: '25px', marginBottom: '30px', flexWrap: 'wrap' }}>
                <div style={cardStyle}>
                  <h3 style={{ marginTop: 0, color: '#1e293b', fontSize: '18px' }}>📤 Bulk Upload</h3>
                  <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '15px' }}>Upload your bank statement as a CSV.</p>
                  <input type="file" onChange={handleFileUpload} style={{ padding: '10px', border: '1px dashed #cbd5e1', borderRadius: '8px', width: '100%' }} />
                </div>

                <div style={{ ...cardStyle, flex: 2 }}>
                  <h3 style={{ marginTop: 0, color: '#1e293b', fontSize: '18px' }}>{editingId ? "✏️ Update Expense" : "✍️ Manual Entry"}</h3>
                  <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '12px', marginTop: '15px', flexWrap: 'wrap' }}>
                    <input style={{...inputStyle, flex: 2}} value={description} placeholder="Description (e.g. Target)" onChange={(e) => setDescription(e.target.value)} required />
                    
                    <select style={{...inputStyle, flex: 1.5, backgroundColor: 'white'}} value={category} onChange={(e) => setCategory(e.target.value)}>
                      <option value="">Auto-Guess Category</option>
                      <option value="Housing">Housing</option>
                      <option value="Food">Food</option>
                      <option value="Transportation">Transportation</option>
                      <option value="Entertainment">Entertainment</option>
                      <option value="Utilities">Utilities</option>
                      <option value="Other">Other</option>
                    </select>

                    <input style={{...inputStyle, maxWidth: '120px'}} type="number" step="0.01" value={amount} placeholder="$ Amount" onChange={(e) => setAmount(e.target.value)} required />
                    <button type="submit" style={btnStyle}>{editingId ? "Save Changes" : "Add Expense"}</button>
                    {editingId && <button type="button" onClick={() => {setEditingId(null); setDescription(''); setAmount(''); setCategory('');}} style={{...btnStyle, backgroundColor: '#94a3b8'}}>Cancel</button>}
                  </form>
                </div>
              </div>

              {/* DATA VISUALIZATION & TABLE */}
              <div style={{ display: 'flex', gap: '25px', flexWrap: 'wrap' }}>
                
                {/* CHART CONTAINER WITH TOGGLE */}
                <div style={{ ...cardStyle, flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <h3 style={{ color: '#1e293b', margin: 0 }}>📊 Breakdown</h3>
                    
                    {/* NEW: View Toggle Buttons */}
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <button onClick={() => setViewMode('pie')} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', cursor: 'pointer', backgroundColor: viewMode === 'pie' ? '#e2e8f0' : 'white' }}>Pie</button>
                      <button onClick={() => setViewMode('bar')} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', cursor: 'pointer', backgroundColor: viewMode === 'bar' ? '#e2e8f0' : 'white' }}>Bar</button>
                    </div>
                  </div>

                  {chartData.length === 0 ? (
                    <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>No data to display.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={320}>
                      {viewMode === 'pie' ? (
                        <PieChart>
                          <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={70} outerRadius={100} label>
                            {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={(value) => `$${value.toFixed(2)}`} />
                          <Legend />
                        </PieChart>
                      ) : (
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="name" tick={{fill: '#64748b'}} axisLine={false} tickLine={false} />
                          <YAxis tick={{fill: '#64748b'}} axisLine={false} tickLine={false} tickFormatter={(value) => `$${value}`} />
                          <Tooltip cursor={{fill: '#f1f5f9'}} formatter={(value) => `$${value.toFixed(2)}`} />
                          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                            {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                          </Bar>
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  )}
                </div>

                {/* ADVANCED TABLE (Untouched) */}
                <div style={{ ...cardStyle, flex: 2, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
                    <h3 style={{ color: '#1e293b', margin: 0 }}>📋 Transactions</h3>
                    <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                      <input type="text" placeholder="🔍 Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{...inputStyle, width: '200px', padding: '8px 12px'}} />
                      <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} style={{...inputStyle, padding: '8px 12px'}}>
                        {availableMonths.map(month => <option key={month} value={month}>{month === 'All' ? '📅 All Time' : month}</option>)}
                      </select>
                      <button onClick={exportToCSV} style={{ padding: '8px 15px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>📥 CSV</button>
                    </div>
                  </div>

                  <div style={{ flex: 1, maxHeight: '400px', overflowY: 'auto', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                      <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f8fafc', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', zIndex: 1 }}>
                        <tr>
                          <th style={thStyle} onClick={() => handleSort('transaction_date')}>Date {sortConfig.key === 'transaction_date' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                          <th style={thStyle} onClick={() => handleSort('description')}>Description {sortConfig.key === 'description' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                          <th style={thStyle} onClick={() => handleSort('category')}>Category {sortConfig.key === 'category' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                          <th style={thStyle} onClick={() => handleSort('amount')}>Amount {sortConfig.key === 'amount' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                          <th style={{...thStyle, textAlign: 'center', cursor: 'default'}}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {processedExpenses.length === 0 ? (
                          <tr><td colSpan="5" style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>No matching transactions found.</td></tr>
                        ) : (
                          processedExpenses.map(exp => (
                            <tr key={exp.id} style={{ borderBottom: '1px solid #f1f5f9' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                              <td style={{ padding: '12px 15px', color: '#64748b', fontSize: '14px' }}>{exp.transaction_date ? new Date(exp.transaction_date).toLocaleDateString() : 'N/A'}</td>
                              <td style={{ padding: '12px 15px', fontWeight: '500', color: '#334155' }}>{exp.description}</td>
                              <td style={{ padding: '12px 15px' }}><span style={{ backgroundColor: '#e0f2fe', color: '#0284c7', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>{exp.category || 'Other'}</span></td>
                              <td style={{ padding: '12px 15px', fontWeight: 'bold', color: '#0f172a' }}>${parseFloat(exp.amount).toFixed(2)}</td>
                              <td style={{ padding: '12px 15px', textAlign: 'center' }}>
                                <button onClick={() => handleEdit(exp)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', marginRight: '10px' }} title="Edit">✏️</button>
                                <button onClick={() => handleDelete(exp.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }} title="Delete">🗑️</button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}