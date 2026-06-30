import { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import { useNavigate } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';

// --- DESIGN SYSTEM TOKENS ---
const theme = {
  sidebar: '#0b1121',
  sidebarHover: '#1e293b',
  bg: '#f3f4f6',
  card: '#ffffff',
  textMain: '#0f172a',
  textMuted: '#64748b',
  border: '#e2e8f0',
  primary: '#3b82f6',
  primaryHover: '#2563eb',
  success: '#10b981',
  successBg: '#d1fae5',
  danger: '#ef4444',
  dangerBg: '#fee2e2',
  warning: '#f59e0b',
  warningBg: '#fef3c7',
  purple: '#8b5cf6',
  purpleBg: '#ede9fe',
  pink: '#ec4899',
  pinkBg: '#fce7f3'
};

const catColors = {
  'Rent': theme.primary,
  'Housing': theme.primary,
  'Food': theme.success,
  'Groceries': theme.success,
  'Transport': theme.warning,
  'Transportation': theme.warning,
  'Shopping': theme.pink,
  'Entertainment': theme.purple,
  'Income': theme.success,
  'Salary': theme.success,
  'Utilities': theme.danger,
  'Other': theme.textMuted
};

export default function Dashboard() {
  const [expenses, setExpenses] = useState([]);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [type, setType] = useState('expense'); // 'expense' or 'income'
  
  const [editingId, setEditingId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Filtering, Sorting, Pagination, and View State
  const [selectedMonth, setSelectedMonth] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'transaction_date', direction: 'desc' });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;
  const [activeTab, setActiveTab] = useState('overview'); 
  const [viewMode, setViewMode] = useState('pie'); // 'pie' or 'bar'
  
  // Support Form State
  const [supportForm, setSupportForm] = useState({ name: '', email: '', message: '' });

  const navigate = useNavigate();
  const userId = localStorage.getItem('userId');
  const API_URL = "https://budget-backend-ebjy.onrender.com";

  // --- API CALLS ---
  const fetchExpenses = async () => {
    if (!userId) { navigate('/'); return; }
    try {
      const res = await axios.get(`${API_URL}/api/expenses?userId=${userId}`);
      setExpenses(res.data);
    } catch (err) { toast.error("Failed to load data."); }
  };

  useEffect(() => { fetchExpenses(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      let finalAmount = Math.abs(parseFloat(amount) || 0);
      if (type === 'expense') finalAmount = -finalAmount;

      const payload = { amount: finalAmount, description, category, userId };
      
      if (editingId) {
        await axios.put(`${API_URL}/api/expenses/${editingId}`, payload);
        toast.success("Transaction updated!");
      } else {
        await axios.post(`${API_URL}/api/expenses`, payload);
        toast.success("Transaction added!");
      }
      closeModal();
      fetchExpenses();
    } catch (err) { toast.error("Something went wrong."); }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('userId', userId);
    toast.promise(
      axios.post(`${API_URL}/api/upload`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
      { loading: 'Importing data...', success: 'Import complete!', error: 'Import failed.' }
    ).then(() => fetchExpenses());
  };

  const handleDelete = async (id) => {
    if (window.confirm("Delete this transaction?")) {
      try {
        await axios.delete(`${API_URL}/api/expenses/${id}`);
        toast.success("Transaction deleted.");
        fetchExpenses();
      } catch (err) { toast.error("Failed to delete."); }
    }
  };

  const handleSupportSubmit = (e) => {
    e.preventDefault();
    toast.success("Message sent successfully! We will get back to you soon.");
    setSupportForm({ name: '', email: '', message: '' }); // Clears the fields perfectly
  };

  const openEditModal = (exp) => {
    setEditingId(exp.id);
    setDescription(exp.description);
    setAmount(Math.abs(exp.amount));
    setType(getCorrectedAmount(exp) >= 0 ? 'income' : 'expense');
    setCategory(exp.category || '');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setDescription('');
    setAmount('');
    setCategory('');
    setType('expense');
  };

  // --- DATA PROCESSING (FIXED RETROACTIVE LOGIC) ---
  // This helper fixes old data where expenses might have been stored as positive numbers
  const getCorrectedAmount = (exp) => {
    let val = parseFloat(exp.amount) || 0;
    if (exp.category === 'Income' || exp.category === 'Salary') return Math.abs(val);
    if (val < 0) return val; 
    if (val > 0 && exp.category !== 'Income') return -Math.abs(val); 
    return 0;
  };

  const availableMonths = ['All', ...new Set(expenses.map(exp => {
    if (!exp.transaction_date) return 'Unknown Date';
    const d = new Date(exp.transaction_date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }))];

  const processedExpenses = useMemo(() => {
    let filtered = expenses.filter(exp => {
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

    filtered.sort((a, b) => {
      let valA = a[sortConfig.key], valB = b[sortConfig.key];
      if (sortConfig.key === 'amount') { valA = parseFloat(valA) || 0; valB = parseFloat(valB) || 0; }
      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return filtered;
  }, [expenses, selectedMonth, searchTerm, sortConfig]);

  // Pagination Logic
  const totalPages = Math.ceil(processedExpenses.length / itemsPerPage);
  const currentTableData = processedExpenses.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // --- CALCULATIONS FOR UI ---
  const totalIncome = expenses.reduce((sum, exp) => {
    const amt = getCorrectedAmount(exp);
    return amt > 0 ? sum + amt : sum;
  }, 0);
  
  const totalSpent = expenses.reduce((sum, exp) => {
    const amt = getCorrectedAmount(exp);
    return amt < 0 ? sum + Math.abs(amt) : sum;
  }, 0);
  
  const netSavings = totalIncome - totalSpent;
  
  const categoryTotals = expenses.reduce((acc, exp) => {
    const amt = getCorrectedAmount(exp);
    if (amt < 0) {
      const cat = exp.category || 'Other';
      acc[cat] = (acc[cat] || 0) + Math.abs(amt);
    }
    return acc;
  }, {});

  const highestCategory = Object.keys(categoryTotals).length > 0 
    ? Object.keys(categoryTotals).reduce((a, b) => categoryTotals[a] > categoryTotals[b] ? a : b) 
    : 'N/A';
  
  const chartData = Object.keys(categoryTotals).map(key => ({ name: key, value: categoryTotals[key] })).filter(item => item.value > 0);
  
  // --- SHARED STYLES ---
  const S = {
    flexCenter: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
    flexBetween: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    card: { backgroundColor: theme.card, borderRadius: '16px', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02), 0 2px 4px -2px rgba(0,0,0,0.02)', border: `1px solid ${theme.border}` },
    input: { padding: '10px 14px', borderRadius: '8px', border: `1px solid ${theme.border}`, outline: 'none', fontSize: '14px', color: theme.textMain, width: '100%', boxSizing: 'border-box' },
    btnPrimary: { backgroundColor: theme.primary, color: 'white', padding: '10px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '500', fontSize: '14px', transition: '0.2s' },
    btnSecondary: { backgroundColor: 'white', color: theme.textMain, padding: '10px 16px', borderRadius: '8px', border: `1px solid ${theme.border}`, cursor: 'pointer', fontWeight: '500', fontSize: '14px', transition: '0.2s' },
    th: { padding: '16px 20px', color: theme.textMuted, fontSize: '13px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: `1px solid ${theme.border}`, cursor: 'pointer', textAlign: 'left' },
    td: { padding: '16px 20px', fontSize: '14px', color: theme.textMain, borderBottom: `1px solid ${theme.border}` },
    pill: (cat) => {
      const isIncome = cat === 'Income';
      const color = catColors[cat] || theme.textMuted;
      const bg = isIncome ? theme.successBg : `${color}20`; 
      return { padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', color: color, backgroundColor: bg, display: 'inline-block' };
    },
    toggleBtn: (active) => ({ padding: '6px 12px', borderRadius: '6px', border: `1px solid ${theme.border}`, cursor: 'pointer', backgroundColor: active ? theme.border : 'white', fontWeight: active ? '600' : '400', fontSize: '12px' })
  };

  const NavItem = ({ id, icon, label }) => {
    const isActive = activeTab === id;
    return (
      <div onClick={() => setActiveTab(id)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 20px', margin: '4px 16px', borderRadius: '8px', cursor: 'pointer', backgroundColor: isActive ? theme.primary : 'transparent', color: isActive ? 'white' : '#94a3b8', transition: 'all 0.2s ease', fontWeight: isActive ? '600' : '500' }}>
        <span style={{ fontSize: '18px' }}>{icon}</span>
        <span>{label}</span>
      </div>
    );
  };

  // Indian Rupee Formatter
  const formatCurrency = (val) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(val));

  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: theme.bg, fontFamily: "'Inter', system-ui, sans-serif", overflow: 'hidden' }}>
      <Toaster position="top-right" />

      {/* --- SIDEBAR --- */}
      <aside style={{ width: '260px', backgroundColor: theme.sidebar, color: 'white', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '32px 24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '32px', height: '32px', backgroundColor: theme.primary, borderRadius: '8px', ...S.flexCenter, fontSize: '18px' }}>💎</div>
          <span style={{ fontSize: '20px', fontWeight: 'bold', letterSpacing: '0.5px' }}>Budget Insights</span>
        </div>
        
        <div style={{ flex: 1, marginTop: '10px' }}>
          <NavItem id="overview" icon="🏠" label="Overview" />
          <NavItem id="transactions" icon="📊" label="Transactions" />
          <NavItem id="support" icon="🎧" label="Support" />
          
          <div style={{ padding: '0 36px', marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '15px', opacity: 0.5 }}>
            <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', color: '#64748b', marginTop: '20px', marginBottom: '5px' }}>Coming Soon</div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', fontSize: '14px' }}><span>🎯</span> Goals</div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', fontSize: '14px' }}><span>📈</span> Reports</div>
          </div>
        </div>

        <div style={{ margin: '24px', padding: '20px', backgroundColor: '#1e293b', borderRadius: '12px', position: 'relative', overflow: 'hidden' }}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'white' }}>🚀 Upgrade to Pro</h4>
          <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#94a3b8', lineHeight: '1.5' }}>Unlock advanced reports, custom budgets & more.</p>
          <button onClick={() => toast("Pro features coming soon!", { icon: '🚀' })} style={{ width: '100%', padding: '8px', backgroundColor: theme.primary, color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>Upgrade Now</button>
        </div>

        <div style={{ padding: '24px', borderTop: '1px solid #1e293b' }}>
          <button onClick={() => { localStorage.removeItem('userId'); navigate('/'); }} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', width: '100%', padding: '8px 0' }}>
            <span>🚪</span> Sign Out
          </button>
        </div>
      </aside>

      {/* --- MAIN CONTENT --- */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        
        <header style={{ height: '80px', backgroundColor: 'white', borderBottom: `1px solid ${theme.border}`, padding: '0 40px', ...S.flexBetween, flexShrink: 0 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px', color: theme.textMain, fontWeight: '700' }}>Welcome back 👋</h1>
            <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: theme.textMuted }}>Here's what's happening with your finances today.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <button onClick={() => toast('No new notifications', { icon: '🔔' })} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', position: 'relative' }}>
              🔔<span style={{ position: 'absolute', top: 0, right: 0, width: '8px', height: '8px', backgroundColor: theme.danger, borderRadius: '50%' }}></span>
            </button>
            <div onClick={() => toast('Profile settings opening soon...', { icon: '👤' })} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 12px', border: `1px solid ${theme.border}`, borderRadius: '24px', cursor: 'pointer' }}>
              <div style={{ width: '30px', height: '30px', backgroundColor: theme.purple, borderRadius: '50%', color: 'white', ...S.flexCenter, fontWeight: 'bold', fontSize: '14px' }}>U</div>
              <span style={{ fontSize: '14px', fontWeight: '500', color: theme.textMain }}>My Profile</span>
            </div>
          </div>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px' }}>
          <div style={{ maxWidth: '1400px', margin: '0 auto' }}>

            {/* --- TAB: OVERVIEW --- */}
            {activeTab === 'overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px' }}>
                  <div style={{ ...S.card }}>
                    <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: theme.textMuted, fontWeight: '500' }}>Total Spent</p>
                    <h2 style={{ margin: 0, fontSize: '32px', color: theme.primary }}>{formatCurrency(totalSpent)}</h2>
                  </div>
                  <div style={{ ...S.card }}>
                    <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: theme.textMuted, fontWeight: '500' }}>Highest Expense</p>
                    <h2 style={{ margin: 0, fontSize: '32px', color: theme.success }}>{highestCategory}</h2>
                  </div>
                  <div style={{ ...S.card }}>
                    <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: theme.textMuted, fontWeight: '500' }}>Total Income</p>
                    <h2 style={{ margin: 0, fontSize: '32px', color: theme.warning }}>{formatCurrency(totalIncome)}</h2>
                  </div>
                  <div style={{ ...S.card }}>
                    <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: theme.textMuted, fontWeight: '500' }}>Net Savings</p>
                    <h2 style={{ margin: 0, fontSize: '32px', color: theme.purple }}>{formatCurrency(netSavings)}</h2>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px' }}>
                  <div style={{ ...S.card, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ ...S.flexBetween, marginBottom: '20px' }}>
                      <h3 style={{ margin: 0, fontSize: '16px', color: theme.textMain }}>Spending Overview</h3>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => setViewMode('pie')} style={S.toggleBtn(viewMode === 'pie')}>Pie</button>
                        <button onClick={() => setViewMode('bar')} style={S.toggleBtn(viewMode === 'bar')}>Bar</button>
                      </div>
                    </div>

                    {chartData.length === 0 ? (
                      <div style={{ flex: 1, ...S.flexCenter, color: theme.textMuted }}>No expense data to visualize yet.</div>
                    ) : (
                      <div style={{ display: 'flex', flex: 1, alignItems: 'center' }}>
                        <div style={{ flex: 1, height: '250px' }}>
                          <ResponsiveContainer width="100%" height="100%">
                            {viewMode === 'pie' ? (
                              <PieChart>
                                <Pie data={chartData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value" stroke="none">
                                  {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={catColors[entry.name] || theme.textMuted} />)}
                                </Pie>
                                <RechartsTooltip formatter={(value) => formatCurrency(value)} />
                              </PieChart>
                            ) : (
                              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.border} />
                                <XAxis dataKey="name" tick={{ fontSize: 12, fill: theme.textMuted }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 12, fill: theme.textMuted }} axisLine={false} tickLine={false} tickFormatter={(val) => `₹${val}`} />
                                <RechartsTooltip cursor={{ fill: theme.bg }} formatter={(value) => formatCurrency(value)} />
                                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                  {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={catColors[entry.name] || theme.primary} />)}
                                </Bar>
                              </BarChart>
                            )}
                          </ResponsiveContainer>
                        </div>
                        {viewMode === 'pie' && (
                          <div style={{ flex: 0.8, display: 'flex', flexDirection: 'column', gap: '12px', paddingLeft: '10px' }}>
                            {chartData.map((data, i) => (
                              <div key={i} style={{ ...S.flexBetween, fontSize: '13px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: catColors[data.name] || theme.textMuted }} />
                                  <span style={{ color: theme.textMain }}>{data.name}</span>
                                </div>
                                <span style={{ color: theme.textMuted, fontWeight: '500' }}>{formatCurrency(data.value)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div style={{ ...S.card }}>
                    <div style={{ ...S.flexBetween, marginBottom: '20px' }}>
                      <h3 style={{ margin: 0, fontSize: '16px', color: theme.textMain }}>Recent Transactions</h3>
                      <span onClick={() => setActiveTab('transactions')} style={{ fontSize: '14px', color: theme.primary, cursor: 'pointer', fontWeight: '500' }}>View all</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {expenses.slice(0, 5).map(exp => {
                        const amt = getCorrectedAmount(exp);
                        const isIncome = amt >= 0;
                        return (
                          <div key={exp.id} style={{ ...S.flexBetween, padding: '12px 0', borderBottom: `1px solid ${theme.border}` }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div style={{ width: '40px', height: '40px', backgroundColor: theme.bg, borderRadius: '10px', ...S.flexCenter, fontSize: '16px' }}>
                                {isIncome ? '💰' : '💳'}
                              </div>
                              <div>
                                <div style={{ fontSize: '14px', fontWeight: '600', color: theme.textMain, marginBottom: '4px' }}>{exp.description}</div>
                                <div style={{ fontSize: '12px', color: theme.textMuted }}>{exp.category || 'Other'}</div>
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '14px', fontWeight: '600', color: isIncome ? theme.success : theme.textMain }}>
                                {isIncome ? '+' : '-'}{formatCurrency(amt)}
                              </div>
                              <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px' }}>
                                {exp.transaction_date ? new Date(exp.transaction_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* --- TAB: TRANSACTIONS --- */}
            {activeTab === 'transactions' && (
              <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '24px', borderBottom: `1px solid ${theme.border}` }}>
                  <div style={{ ...S.flexBetween, marginBottom: '24px' }}>
                    <div>
                      <h2 style={{ margin: '0 0 4px 0', fontSize: '20px' }}>Transactions</h2>
                      <p style={{ margin: 0, fontSize: '14px', color: theme.textMuted }}>Track and manage your income and expenses.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <label style={{ ...S.btnSecondary, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        📥 Import CSV
                        <input type="file" style={{ display: 'none' }} onChange={handleFileUpload} />
                      </label>
                      <button onClick={() => setIsModalOpen(true)} style={S.btnPrimary}>+ Add Transaction</button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '16px' }}>
                    <input type="text" placeholder="🔍 Search transactions..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={S.input} />
                    <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} style={S.input}>
                      {availableMonths.map(m => <option key={m} value={m}>{m === 'All' ? '📅 All Time' : m}</option>)}
                    </select>
                    <button onClick={() => { toast.success("Export started!"); setTimeout(() => { toast("To export correctly, use standard CSV logic.", {icon: '📤'}); }, 1000); }} style={S.btnSecondary}>📤 Export Data</button>
                  </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ backgroundColor: '#f8fafc' }}>
                      <tr>
                        <th style={S.th}>Date</th>
                        <th style={S.th}>Description</th>
                        <th style={S.th}>Category</th>
                        <th style={S.th}>Type</th>
                        <th style={S.th}>Amount</th>
                        <th style={{ ...S.th, textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentTableData.length === 0 ? (
                        <tr><td colSpan="6" style={{ padding: '40px', textAlign: 'center', color: theme.textMuted }}>No transactions found.</td></tr>
                      ) : (
                        currentTableData.map(exp => {
                          const amt = getCorrectedAmount(exp);
                          const isIncome = amt >= 0;
                          return (
                            <tr key={exp.id} style={{ transition: 'background-color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}>
                              <td style={S.td}>{exp.transaction_date ? new Date(exp.transaction_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}</td>
                              <td style={{ ...S.td, fontWeight: '500' }}>{exp.description}</td>
                              <td style={S.td}><span style={S.pill(exp.category || 'Other')}>{exp.category || 'Other'}</span></td>
                              <td style={S.td}><span style={S.pill(isIncome ? 'Income' : 'Expense')}>{isIncome ? 'Income' : 'Expense'}</span></td>
                              <td style={{ ...S.td, fontWeight: '600', color: isIncome ? theme.success : theme.textMain }}>
                                {isIncome ? '+' : '-'}{formatCurrency(amt)}
                              </td>
                              <td style={{ ...S.td, textAlign: 'right' }}>
                                <button onClick={() => openEditModal(exp)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', marginRight: '12px' }}>✏️</button>
                                <button onClick={() => handleDelete(exp.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: theme.danger }}>🗑️</button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                <div style={{ padding: '16px 24px', borderTop: `1px solid ${theme.border}`, ...S.flexBetween, backgroundColor: '#f8fafc' }}>
                  <span style={{ fontSize: '14px', color: theme.textMuted }}>Showing {currentTableData.length} of {processedExpenses.length} transactions</span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} style={{ ...S.btnSecondary, padding: '6px 12px' }}>Prev</button>
                    <button disabled={currentPage === totalPages || totalPages === 0} onClick={() => setCurrentPage(p => p + 1)} style={{ ...S.btnSecondary, padding: '6px 12px' }}>Next</button>
                  </div>
                </div>
              </div>
            )}

            {/* --- TAB: SUPPORT --- */}
            {activeTab === 'support' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div>
                  <h2 style={{ margin: '0 0 8px 0', fontSize: '24px' }}>Support</h2>
                  <p style={{ margin: 0, color: theme.textMuted }}>We're here to help you with any questions.</p>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
                  <div style={S.card}>
                    <h3 style={{ margin: '0 0 20px 0', fontSize: '16px' }}>Get in Touch</h3>
                    <p style={{ fontSize: '14px', color: theme.textMuted, marginBottom: '24px' }}>Can't find what you're looking for? Reach out to our support team.</p>
                    
                    <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
                      <div style={{ width: '40px', height: '40px', backgroundColor: theme.primary + '20', color: theme.primary, borderRadius: '50%', ...S.flexCenter, fontSize: '18px' }}>✉️</div>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>Email Support</div>
                        <div style={{ fontSize: '14px', color: theme.primary }}>support@budgetinsights.com</div>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '16px' }}>
                      <div style={{ width: '40px', height: '40px', backgroundColor: theme.success + '20', color: theme.success, borderRadius: '50%', ...S.flexCenter, fontSize: '18px' }}>📞</div>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>Phone Support</div>
                        <div style={{ fontSize: '14px', color: theme.textMuted }}>+91 9491143778</div>
                        <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>Mon - Fri, 9:00 AM - 6:00 PM</div>
                      </div>
                    </div>
                  </div>

                  <div style={S.card}>
                    <h3 style={{ margin: '0 0 20px 0', fontSize: '16px' }}>Popular Topics</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {['How to add a transaction', 'How to create a budget', 'Understanding reports', 'Data security & privacy'].map(topic => (
                        <div key={topic} onClick={() => toast('Opening help article: ' + topic, { icon: '📖' })} style={{ ...S.flexBetween, paddingBottom: '16px', borderBottom: `1px solid ${theme.border}`, cursor: 'pointer' }}>
                          <span style={{ fontSize: '14px', color: theme.textMuted }}>{topic}</span>
                          <span style={{ color: theme.border }}>➔</span>
                        </div>
                      ))}
                      <button onClick={() => toast('Loading Help Center...', { icon: '🌐' })} style={{ ...S.btnSecondary, width: '100%', marginTop: '8px' }}>View All Articles</button>
                    </div>
                  </div>

                  <div style={S.card}>
                    <h3 style={{ margin: '0 0 20px 0', fontSize: '16px' }}>Send us a message</h3>
                    <form onSubmit={handleSupportSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <input style={S.input} placeholder="Your Name" required value={supportForm.name} onChange={e => setSupportForm({...supportForm, name: e.target.value})} />
                      <input style={S.input} type="email" placeholder="Your Email" required value={supportForm.email} onChange={e => setSupportForm({...supportForm, email: e.target.value})} />
                      <textarea style={{ ...S.input, height: '100px', resize: 'vertical' }} placeholder="How can we help you?" required value={supportForm.message} onChange={e => setSupportForm({...supportForm, message: e.target.value})}></textarea>
                      <button type="submit" style={S.btnPrimary}>Send Message</button>
                    </form>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </main>

      {/* --- ADD/EDIT MODAL --- */}
      {isModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', zIndex: 1000, ...S.flexCenter }}>
          <div style={{ width: '100%', maxWidth: '450px', backgroundColor: 'white', borderRadius: '16px', padding: '32px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
            <div style={{ ...S.flexBetween, marginBottom: '24px' }}>
              <h2 style={{ margin: 0, fontSize: '20px' }}>{editingId ? 'Edit Transaction' : 'New Transaction'}</h2>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: theme.textMuted }}>✕</button>
            </div>
            
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              <div style={{ display: 'flex', backgroundColor: theme.bg, borderRadius: '8px', padding: '4px' }}>
                <div onClick={() => setType('expense')} style={{ flex: 1, textAlign: 'center', padding: '8px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '500', backgroundColor: type === 'expense' ? 'white' : 'transparent', boxShadow: type === 'expense' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', color: type === 'expense' ? theme.danger : theme.textMuted }}>Expense</div>
                <div onClick={() => setType('income')} style={{ flex: 1, textAlign: 'center', padding: '8px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '500', backgroundColor: type === 'income' ? 'white' : 'transparent', boxShadow: type === 'income' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', color: type === 'income' ? theme.success : theme.textMuted }}>Income</div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', color: theme.textMuted, marginBottom: '8px' }}>Amount</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: theme.textMuted }}>₹</span>
                  <input style={{ ...S.input, paddingLeft: '30px' }} type="number" step="0.01" min="0" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} required />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', color: theme.textMuted, marginBottom: '8px' }}>Description</label>
                <input style={S.input} type="text" placeholder="e.g. Netflix Subscription" value={description} onChange={(e) => setDescription(e.target.value)} required />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', color: theme.textMuted, marginBottom: '8px' }}>Category</label>
                <select style={{ ...S.input, backgroundColor: 'white' }} value={category} onChange={(e) => setCategory(e.target.value)} required>
                  <option value="" disabled>Select a category</option>
                  <option value="Income">Income (Salary, Deposit)</option>
                  <option value="Housing">Housing & Rent</option>
                  <option value="Food">Food & Groceries</option>
                  <option value="Transportation">Transportation</option>
                  <option value="Entertainment">Entertainment</option>
                  <option value="Shopping">Shopping</option>
                  <option value="Utilities">Utilities</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                <button type="button" onClick={closeModal} style={{ ...S.btnSecondary, flex: 1 }}>Cancel</button>
                <button type="submit" style={{ ...S.btnPrimary, flex: 1 }}>{editingId ? 'Save Changes' : 'Add Transaction'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}