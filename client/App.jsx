import { useEffect, useState } from 'react';
import axios from 'axios';

function App() {
  const [message, setMessage] = useState('');

  useEffect(() => {
    // This calls the /api/test endpoint we created earlier
    axios.get('http://localhost:3000/api/test')
      .then(response => setMessage(response.data.message))
      .catch(error => console.error("Error connecting to backend:", error));
  }, []);

  return (
    <div>
      <h1>BudgetInsights</h1>
      <p>Backend Status: <strong>{message || "Loading..."}</strong></p>
    </div>
  );
}

export default App;