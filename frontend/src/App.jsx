import { useState } from 'react';
import InFinPanel from './components/InFinPanel';
import FormContainer from './components/FormContainer';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import AdminDashboard from './components/AdminDashboard';
import PolicyPage from './components/PolicyPage';

function loadRazorpayScript(src) {
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

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

  const triggerRazorpayCheckout = async (amount, onSuccess) => {
    const res = await loadRazorpayScript("https://checkout.razorpay.com/v1/checkout.js");

    if (!res) {
      alert("Razorpay SDK failed to load. Are you offline?");
      return;
    }

    try {
      const response = await fetch("http://localhost:8000/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amount, currency: "INR" }) 
      });
      
      const order = await response.json();

      if (!order.order_id) {
        alert("Server error. Please check backend.");
        return;
      }

      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID, 
        amount: order.amount.toString(),
        currency: order.currency,
        name: "InFin Platform",
        description: "Policy Premium",
        order_id: order.order_id, 
        handler: function (response) {
          // onSuccess is called when payment is successful
          onSuccess(response);
        },
        prefill: {
          name: user?.platform_name || "User Example",
          email: user?.email || "user@example.com",
          contact: user?.phone || "9999999999"
        },
        theme: {
          color: "#0066FF"
        }
      };

      const paymentObject = new window.Razorpay(options);
      paymentObject.open();

    } catch (error) {
      console.error(error);
      alert("Error initiating payment.");
    }
  };

  const renderView = () => {
    if (view === 'admin_dashboard') {
      return <AdminDashboard user={user} onLogout={handleLogout} />;
    }
    if (view === 'policy') {
      return (
        <PolicyPage 
          user={user} 
          onBack={() => setView('dashboard')} 
          triggerRazorpay={triggerRazorpayCheckout}
        />
      );
    }
    if (view === 'dashboard') {
      return (
        <Dashboard 
          user={user} 
          onLogout={handleLogout} 
          onGoToPolicy={() => setView('policy')} 
          triggerRazorpay={triggerRazorpayCheckout}
        />
      );
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
  };

  return (
    <>
      {renderView()}
    </>
  );
}

export default App;
