import React, { useState } from 'react';
import InFinPanel from './InFinPanel';
import { supabase } from '../supabase';

const Login = ({ onLoginSuccess, onGoToSignup }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    
    try {
      // Admin specific bypass
      if (email === 'admin@infin.com' && password === 'admin123') {
        onLoginSuccess({ email: 'admin@infin.com', role: 'admin' });
        return;
      }
      
      const { data, error } = await supabase
        .from('workers')
        .select('*')
        .eq('email', email)
        .eq('password', password)
        .single();
        
      if (error || !data) {
        throw new Error('Invalid email or password');
      }
      
      onLoginSuccess(data);
    } catch (err) {
      setErrorMsg(err.message || 'Login failed. Please verify your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-[1200px] h-[800px] max-h-[90vh] bg-[#2B2B2B] rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row border border-white/5 relative">
      <InFinPanel />
      
      {/* Top Right Signup Button */}
      <div className="absolute top-6 right-8 text-white z-20 hidden md:block">
        <span className="text-gray-400 text-sm mr-4">Don't have an account?</span>
        <button 
          onClick={onGoToSignup}
          className="bg-transparent border border-[#0066FF] text-[#0066FF] hover:bg-[#0066FF] hover:text-white px-6 py-2 rounded-full font-semibold transition-colors"
        >
          Sign Up
        </button>
      </div>
      
      {/* Login Form Container */}
      <div className="w-full md:w-1/2 p-6 md:p-10 flex flex-col items-center relative bg-[#222222] overflow-y-auto">
        <div className="w-full max-w-md my-auto py-8">
          <h2 className="text-3xl font-bold text-white mb-2">Welcome Back</h2>
          <p className="text-gray-400 mb-8">Login to manage your policies and earnings.</p>
          
          <form onSubmit={handleLogin} className="space-y-6">
            {errorMsg && (
              <div className="bg-red-500/10 border border-red-500 text-red-500 p-4 rounded-lg text-sm">
                {errorMsg}
              </div>
            )}
            
            <div>
              <label className="block text-xs text-gray-400 mb-1 ml-1 uppercase tracking-wide">
                Email Address
              </label>
              <input
                type="email"
                required
                placeholder="worker@example.com"
                className="w-full bg-[#1F1F1F] border border-[#444] rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#0066FF] transition-colors"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1 ml-1 uppercase tracking-wide">
                Password
              </label>
              <input
                type="password"
                required
                placeholder="Enter your password"
                className="w-full bg-[#1F1F1F] border border-[#444] rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#0066FF] transition-colors"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>
            
            <button
              type="submit"
              disabled={loading}
              className="mt-8 w-full bg-[#0066FF] hover:bg-[#0052cc] text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Logging in...' : 'Log In'}
            </button>
          </form>
          
          {/* Mobile Signup Button */}
          <div className="mt-8 text-center block md:hidden">
            <span className="text-gray-400 text-sm">Don't have an account? </span>
            <button 
              onClick={onGoToSignup}
              className="text-[#0066FF] font-semibold hover:underline"
            >
              Sign Up
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
