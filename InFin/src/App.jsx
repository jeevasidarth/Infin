import { useState } from 'react';
import InFinPanel from './components/InFinPanel';
import FormContainer from './components/FormContainer';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import AdminDashboard from './components/AdminDashboard';

function App() {
  const [view, setView] = useState('login'); // 'login', 'signup', 'dashboard'
  const [user, setUser] = useState(null);

  const handleLoginSuccess = (userData) => {
    setUser(userData);
    if (userData.role === 'admin') {
      setView('admin_dashboard');
    } else {
      setView('dashboard');
    }
  };

  const handleLogout = () => {
    setUser(null);
    setView('login');
  };

  if (view === 'admin_dashboard') {
    return <AdminDashboard user={user} onLogout={handleLogout} />;
  }

  if (view === 'dashboard') {
    return <Dashboard user={user} onLogout={handleLogout} />;
  }

  if (view === 'login') {
    return (
      <div className="min-h-screen bg-[#1F1F1F] flex items-center justify-center p-4">
        <Login 
          onLoginSuccess={handleLoginSuccess}
          onGoToSignup={() => setView('signup')}
        />
      </div>
    );
  }

  // Signup view
  return (
    <div className="min-h-screen bg-[#1F1F1F] flex items-center justify-center p-4">
      <div className="w-full max-w-[1200px] h-[800px] max-h-[90vh] bg-[#2B2B2B] rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row border border-white/5 relative">
        <InFinPanel />
        <FormContainer onGoToLogin={() => setView('login')} />
      </div>
    </div>
  );
}

export default App;
