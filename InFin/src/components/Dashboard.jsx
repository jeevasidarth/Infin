import React from 'react';

const Dashboard = ({ user, onLogout }) => {
  return (
    <div className="min-h-screen bg-[#1F1F1F] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-[#2B2B2B] rounded-2xl shadow-2xl overflow-hidden border border-white/5 p-10 text-center">
        <h1 className="text-4xl font-bold text-white mb-4">Welcome to InFin Dashboard</h1>
        <p className="text-gray-400 mb-8">Hello, {user?.email || 'Worker'}! You are successfully logged in.</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 text-left">
          <div className="bg-[#1F1F1F] p-6 rounded-xl border border-[#444]">
            <h3 className="text-xl font-semibold text-white mb-2">Earnings</h3>
            <p className="text-3xl font-bold text-[#0066FF]">$0.00</p>
          </div>
          <div className="bg-[#1F1F1F] p-6 rounded-xl border border-[#444]">
            <h3 className="text-xl font-semibold text-white mb-2">Policies</h3>
            <p className="text-3xl font-bold text-[#0066FF]">Active</p>
          </div>
          <div className="bg-[#1F1F1F] p-6 rounded-xl border border-[#444]">
            <h3 className="text-xl font-semibold text-white mb-2">Claims</h3>
            <p className="text-3xl font-bold text-[#0066FF]">0</p>
          </div>
        </div>

        <button
          onClick={onLogout}
          className="bg-[#333] hover:bg-[#444] text-white font-semibold py-3 px-8 rounded-lg transition-colors"
        >
          Logout
        </button>
      </div>
    </div>
  );
};

export default Dashboard;
