import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { Users, AlertCircle, FileText, CheckCircle, Clock } from 'lucide-react';

const AdminDashboard = ({ user, onLogout }) => {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const fetchWorkers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('workers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setWorkers(data || []);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to fetch workers data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkers();
  }, []);

  return (
    <div className="min-h-screen bg-[#1F1F1F] p-4 md:p-8 flex justify-center">
      <div className="w-full max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 bg-[#2B2B2B] p-6 rounded-2xl shadow-xl border border-white/5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[#0066FF]/20 rounded-xl flex items-center justify-center text-[#0066FF]">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
              <p className="text-gray-400 text-sm">Manage enrolled workers and policies</p>
            </div>
          </div>
          
          <button
            onClick={onLogout}
            className="bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white font-medium py-2 px-6 rounded-lg transition-colors border border-red-500/20"
          >
            Logout ({user?.email})
          </button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-[#2B2B2B] p-6 rounded-2xl border border-white/5">
            <div className="flex items-center gap-3 text-gray-400 mb-2">
              <Users className="w-5 h-5 text-[#0066FF]" />
              <h3 className="text-sm font-medium">Total Workers</h3>
            </div>
            <p className="text-3xl font-bold text-white">{workers.length}</p>
          </div>
          <div className="bg-[#2B2B2B] p-6 rounded-2xl border border-white/5">
            <div className="flex items-center gap-3 text-gray-400 mb-2">
              <FileText className="w-5 h-5 text-green-500" />
              <h3 className="text-sm font-medium">Active Policies</h3>
            </div>
            <p className="text-3xl font-bold text-white">-</p>
          </div>
          <div className="bg-[#2B2B2B] p-6 rounded-2xl border border-white/5">
            <div className="flex items-center gap-3 text-gray-400 mb-2">
              <AlertCircle className="w-5 h-5 text-yellow-500" />
              <h3 className="text-sm font-medium">Pending Claims</h3>
            </div>
            <p className="text-3xl font-bold text-white">-</p>
          </div>
          <div className="bg-[#2B2B2B] p-6 rounded-2xl border border-white/5">
            <div className="flex items-center gap-3 text-gray-400 mb-2">
              <CheckCircle className="w-5 h-5 text-purple-500" />
              <h3 className="text-sm font-medium">Settled Claims</h3>
            </div>
            <p className="text-3xl font-bold text-white">-</p>
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-[#2B2B2B] rounded-2xl shadow-xl border border-white/5 overflow-hidden">
          <div className="p-6 border-b border-white/5 flex justify-between items-center">
            <h2 className="text-xl font-bold text-white">Registered Workers</h2>
            <button 
              onClick={fetchWorkers}
              className="text-sm text-gray-400 hover:text-white flex items-center gap-2"
            >
              <Clock className="w-4 h-4" />
              Refresh
            </button>
          </div>
          
          <div className="overflow-x-auto">
            {errorMsg ? (
              <div className="p-6 text-red-500 bg-red-500/5">{errorMsg}</div>
            ) : loading ? (
              <div className="p-10 text-center text-gray-400 flex flex-col items-center">
                <svg className="animate-spin mb-4 h-8 w-8 text-[#0066FF]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Loading workers data...
              </div>
            ) : workers.length === 0 ? (
              <div className="p-10 text-center text-gray-400">No workers registered yet.</div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#1F1F1F] text-gray-400 text-sm uppercase tracking-wider">
                    <th className="p-4 font-medium max-w-[150px] truncate">ID / Platform</th>
                    <th className="p-4 font-medium">Contact</th>
                    <th className="p-4 font-medium">Location</th>
                    <th className="p-4 font-medium">Payment (UPI)</th>
                    <th className="p-4 font-medium">Joined Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {workers.map((worker) => (
                    <tr key={worker.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="p-4">
                        <div className="font-medium text-white">{worker.platform}</div>
                        <div className="text-xs text-gray-500">ID: {worker.platform_partner_id}</div>
                      </td>
                      <td className="p-4">
                        <div className="text-sm text-white">{worker.email || 'No email'}</div>
                        <div className="text-xs text-gray-500">{worker.phone_number}</div>
                      </td>
                      <td className="p-4 text-sm text-gray-300">
                        {worker.city} - {worker.pin_code}
                      </td>
                      <td className="p-4 text-sm font-mono text-gray-400">
                        {worker.upi_vpa}
                      </td>
                      <td className="p-4 text-sm text-gray-400">
                        {new Date(worker.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
