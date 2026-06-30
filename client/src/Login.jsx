import { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const endpoint = isLogin ? '/api/login' : '/api/register';
    
    try {
      const res = await axios.post(`http://localhost:3000${endpoint}`, { email, password });
      
      if (isLogin) {
        localStorage.setItem('userId', res.data.userId);
        toast.success("Welcome back!");
        navigate('/dashboard');
      } else {
        toast.success("Account created! Please log in.");
        setIsLogin(true); // Switch back to login view
        setPassword('');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || "An error occurred.");
    }
  };

  // --- STYLES ---
  const containerStyle = { 
    display: 'flex', justifyContent: 'center', alignItems: 'center', 
    height: '100vh', background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)', 
    fontFamily: "'Inter', system-ui, sans-serif" 
  };
  const cardStyle = { 
    backgroundColor: 'white', padding: '50px 40px', borderRadius: '16px', 
    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', width: '100%', maxWidth: '420px', 
    textAlign: 'center', borderTop: '4px solid #3b82f6'
  };
  const inputStyle = { 
    width: '100%', padding: '14px', margin: '10px 0', borderRadius: '8px', 
    border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box', fontSize: '15px'
  };
  const btnStyle = { 
    width: '100%', padding: '14px', backgroundColor: '#3b82f6', color: 'white', 
    border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', 
    fontSize: '16px', marginTop: '15px', transition: '0.2s'
  };

  return (
    <div style={containerStyle}>
      <Toaster position="bottom-right" />
      <div style={cardStyle}>
        <h1 style={{ color: '#0f172a', margin: '0 0 10px 0', fontSize: '28px' }}>💎 Budget Insights</h1>
        <p style={{ color: '#64748b', marginBottom: '35px', fontSize: '16px' }}>
          Welcome! Please {isLogin ? 'log in' : 'register'} to continue.
        </p>
        
        <form onSubmit={handleSubmit}>
          <input type="email" placeholder="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} required />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} required />
          <button type="submit" style={btnStyle} onMouseOver={(e) => e.target.style.backgroundColor = '#2563eb'} onMouseOut={(e) => e.target.style.backgroundColor = '#3b82f6'}>
            {isLogin ? 'Secure Login' : 'Create Account'}
          </button>
        </form>
        
        <p style={{ marginTop: '25px', color: '#64748b', fontSize: '14px' }}>
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <span style={{ color: '#3b82f6', cursor: 'pointer', fontWeight: 'bold' }} onClick={() => setIsLogin(!isLogin)}>
            {isLogin ? 'Register here' : 'Log in here'}
          </span>
        </p>
      </div>
    </div>
  );
}