import React, { useState, useEffect, useRef } from 'react';
import { Shield, ChevronRight, X, ExternalLink, ShieldCheck, Clock, AlertCircle, CloudLightning, Radio, CheckCircle, MapPin, Mail, Phone, Wind, Newspaper, UploadCloud, FileImage, Trash2, Home, Activity, History, Lock, Eye } from 'lucide-react';
import { supabase } from '../supabase';
import { API_BASE_URL } from '../config';

const Dashboard = ({ user, onLogout, onGoToPolicy, triggerRazorpay }) => {
  const [activeTab, setActiveTab] = useState('overview'); 
  
  const [showTerms, setShowTerms] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [modalMode, setModalMode] = useState('subscribe');

  const [activePolicy, setActivePolicy] = useState(null);
  const [allClaims, setAllClaims] = useState([]);
  const [loyaltySettlements, setLoyaltySettlements] = useState([]);
  const [loadingPolicy, setLoadingPolicy] = useState(true);
  const [renewing, setRenewing] = useState(false);
  const [renewalFeedback, setRenewalFeedback] = useState(null);
  const [disruptionStage, setDisruptionStage] = useState(0); 
  const [newPayoutAlert, setNewPayoutAlert] = useState(null); 
  
  const [weather, setWeather] = useState(null);
  const [loadingWeather, setLoadingWeather] = useState(true);
  const [aqi, setAqi] = useState(null);
  const [loadingAqi, setLoadingAqi] = useState(true);
  const [news, setNews] = useState(null);
  const [loadingNews, setLoadingNews] = useState(true);

  // Upload state
  const [dragActive, setDragActive] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const id = user?.id || user?.worker_id;
        if (!id) return;
        
        const { data: activeData, error: activeErr } = await supabase
          .from('policies')
          .select('*')
          .eq('worker_id', id)
          .in('status', ['active', 'pending'])
          .single();
          
        if (activeData && !activeErr) {
          setActivePolicy(activeData);
        }

        const pols = await supabase.from('policies').select('id').eq('worker_id', id);
        if (pols.data && pols.data.length > 0) {
           const p_ids = pols.data.map(p => p.id);
           
           const {data: claimsData} = await supabase
             .from('claims')
             .select('*')
             .in('policy_id', p_ids)
             .order('created_at', {ascending: false});
             
           if (claimsData) setAllClaims(claimsData);

           const {data: settlementsData} = await supabase
             .from('loyalty_settlements')
             .select('*')
             .in('policy_id', p_ids)
             .order('settled_at', {ascending: false});

           if (settlementsData) setLoyaltySettlements(settlementsData);

           const seenIds = JSON.parse(localStorage.getItem(`seen_payouts_${id}`) || '[]');
           const newClaim = claimsData?.find(c => c.status === 'approved' && !seenIds.includes(c.id));
           const newBonus = settlementsData?.find(s => !seenIds.includes(s.id));

           if (newBonus) {
              setNewPayoutAlert({ id: newBonus.id, type: 'bonus', amount: newBonus.return_amount });
           } else if (newClaim) {
              setNewPayoutAlert({ id: newClaim.id, type: 'claim', amount: newClaim.final_payout });
           }
        }
      } catch (err) {
        console.error("Error fetching data:", err);
      } finally {
        setLoadingPolicy(false);
      }
    };
    fetchData();
  }, [user]);

  useEffect(() => {
    const fetchWeather = async () => {
      if (!user?.city) return;
      try {
        const res = await fetch(`${API_BASE_URL}/api/weather/${user.city}`);
        if (res.ok) setWeather(await res.json());
      } catch (err) {} finally { setLoadingWeather(false); }
    };
    fetchWeather();
  }, [user]);

  useEffect(() => {
    const fetchAqi = async () => {
      if (!user?.city) return;
      try {
        const res = await fetch(`${API_BASE_URL}/api/aqi/${user.city}`);
        if (res.ok) setAqi(await res.json());
      } catch (err) {} finally { setLoadingAqi(false); }
    };
    fetchAqi();
  }, [user]);

  useEffect(() => {
    const fetchNews = async () => {
      if (!user?.city) return;
      try {
        const res = await fetch(`${API_BASE_URL}/api/news/${user.city}`);
        if (res.ok) setNews(await res.json());
      } catch (err) {} finally { setLoadingNews(false); }
    };
    fetchNews();
  }, [user]);

  const dismissPayoutAlert = () => {
    if (!newPayoutAlert) return;
    const id = user?.id || user?.worker_id;
    const seenIds = JSON.parse(localStorage.getItem(`seen_payouts_${id}`) || '[]');
    if (!seenIds.includes(newPayoutAlert.id)) {
        seenIds.push(newPayoutAlert.id);
        localStorage.setItem(`seen_payouts_${id}`, JSON.stringify(seenIds));
    }
    setNewPayoutAlert(null);
  };

  const combinedHistory = [
    ...allClaims.map(c => ({ ...c, type: 'claim', date: c.created_at })),
    ...loyaltySettlements.map(s => ({ ...s, type: 'bonus', date: s.settled_at }))
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  const isPolicyActive = !!activePolicy;
  let daysUntilReset = 0;
  if (isPolicyActive && activePolicy.next_due_date) {
    const nextDue = new Date(activePolicy.next_due_date);
    const diffTime = nextDue - new Date();
    daysUntilReset = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
  }
  const canRenew = isPolicyActive && activePolicy.cumulative_weeks_count < 2;

  const handleRenewPolicy = async () => {
    if (!activePolicy) return;
    setRenewing(true);
    setRenewalFeedback(null);
    
    await triggerRazorpay(activePolicy.policy_cost, async (paymentResponse) => {
        try {
          const res = await fetch(`${API_BASE_URL}/api/v1/policy/renew`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ policy_id: activePolicy.id })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.detail || "Failed to renew");
          
          setActivePolicy({
            ...activePolicy,
            cumulative_weeks_count: data.cumulative_weeks_count,
            cumulative_amount_collected: data.cumulative_amount_collected,
            next_due_date: data.next_due_date
          });
          setRenewalFeedback({ type: 'success', message: 'Policy renewed successfully!' });
          setTimeout(() => setRenewalFeedback(null), 5000);
        } catch (err) {
          setRenewalFeedback({ type: 'error', message: err.message });
        } finally {
          setRenewing(false);
        }
    });
    setTimeout(() => setRenewing(false), 2000);
  };

  const handleAccept = () => {
    setShowTerms(false);
    if (modalMode === 'subscribe') onGoToPolicy();
    else handleRenewPolicy();
  };

  // Upload Logic
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const newFiles = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
      setUploadedFiles(prev => [...prev, ...newFiles]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
        const newFiles = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
        setUploadedFiles(prev => [...prev, ...newFiles]);
    }
  };

  const removeFile = (idx) => {
    setUploadedFiles(uploadedFiles.filter((_, i) => i !== idx));
  };

  return (
    <div className="min-h-screen bg-[#141414] text-white relative flex flex-col font-sans">
      
      {/* Dynamic Background Overlays for Depth */}
      <div className="fixed inset-0 z-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none"></div>
      <div className="fixed top-[-10%] left-[-10%] w-2/3 h-2/3 bg-[#0066FF]/5 rounded-full blur-[150px] pointer-events-none z-0"></div>
      <div className="fixed bottom-[-10%] right-[-10%] w-1/2 h-1/2 bg-emerald-500/5 rounded-full blur-[150px] pointer-events-none z-0"></div>

      {/* Top Navbar */}
      <nav className="bg-[#1C1C1C]/80 backdrop-blur-xl border-b border-white/5 sticky top-0 z-40 shadow-xl transition-all">
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-5 flex justify-between items-center">
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-3">
            <div className="bg-[#0066FF]/10 p-2 rounded-lg">
               <ShieldCheck className="text-[#0066FF] w-7 h-7"/> 
            </div>
            InFin
          </h1>
          <div className="flex items-center gap-6">
             <span className="text-gray-400 font-medium hidden sm:block">Welcome, <span className="text-white">{user?.platform || 'Delivery'} Partner</span></span>
             <button
               onClick={onLogout}
               className="text-gray-300 hover:text-white transition-all border border-white/10 hover:border-white/20 hover:bg-white/5 px-5 py-2 rounded-xl text-sm font-bold shadow-sm"
             >
               Logout
             </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="max-w-7xl mx-auto px-6 md:px-8 flex space-x-2 sm:space-x-6 overflow-x-auto scrollbar-hide pt-1 pb-0">
          {[
            { id: 'overview', icon: Home, label: 'Overview' },
            { id: 'environment', icon: Wind, label: 'Environment' },
            { id: 'history', icon: History, label: 'Claims History' },
            { id: 'earnings', icon: UploadCloud, label: 'Earnings Upload' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-4 border-b-2 font-bold transition-all whitespace-nowrap tracking-wide text-sm ${
                activeTab === tab.id 
                 ? 'border-[#0066FF] text-[#0066FF]' 
                 : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'opacity-100' : 'opacity-60'}`} />
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Main Content Container */}
      <main className="max-w-7xl mx-auto px-6 md:px-8 py-10 relative z-10 w-full flex-grow flex flex-col">

        {/* Tab: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-8 animate-fade-in flex-grow flex flex-col">
            {/* Global Notifications */}
            {newPayoutAlert && (
              <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/5 border border-green-500/50 rounded-2xl p-6 flex flex-col md:flex-row items-center gap-6 shadow-2xl shadow-green-500/10 backdrop-blur-md">
                <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center shrink-0 shadow-lg shadow-green-500/30">
                  <ShieldCheck className="text-white w-8 h-8"/>
                </div>
                <div className="flex-1 text-center md:text-left">
                  <h3 className="text-2xl font-black text-green-400 mb-1">
                    {newPayoutAlert.type === 'bonus' ? 'Loyalty Bonus Received!' : 'Insurance Claim Paid!'}
                  </h3>
                  <p className="text-gray-300">
                    A payout of <strong className="text-white text-xl">₹{newPayoutAlert.amount}</strong> has been credited directly to your registered UPI.
                  </p>
                </div>
                <button onClick={dismissPayoutAlert} className="bg-white/5 hover:bg-white/10 border border-white/10 text-white px-8 py-3 rounded-xl font-bold transition-all">Dismiss</button>
              </div>
            )}

            {allClaims.length > 0 && allClaims[0].status === 'pending' && (
              <div className="bg-yellow-500/10 border border-yellow-500/50 rounded-2xl p-6 flex items-start gap-4 backdrop-blur-md">
                <AlertCircle className="text-yellow-500 w-6 h-6 shrink-0 mt-1"/>
                <div>
                  <h3 className="text-yellow-500 font-bold text-lg mb-1">Severe Weather Disruption Detected</h3>
                  <p className="text-gray-300">Your specific operating zone is currently tracking an active event. No action is required. We'll evaluate conditions and process your payout automatically once the event normalizes.</p>
                </div>
              </div>
            )}

            {/* Insurance Overview Card */}
            <div className="bg-gradient-to-br from-[#2B2B2B] to-[#1A1A1A] rounded-[2rem] p-8 md:p-10 shadow-2xl border border-white/5 relative overflow-hidden flex-grow flex flex-col justify-center">
              <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#0066FF]/10 rounded-full blur-[120px] pointer-events-none"></div>
              
              <div className="flex flex-col lg:flex-row justify-between gap-12 relative z-10">
                <div className="flex-1 flex flex-col justify-center">
                  <h2 className="text-4xl font-black text-white mb-3">Policy Dashboard</h2>
                  <p className="text-gray-400 text-lg mb-10 max-w-lg leading-relaxed">Secure your daily gig earnings against severe weather, floods, and unforeseen civil disruptions. 100% automated.</p>

                  {!isPolicyActive && !loadingPolicy && (
                    <button
                      onClick={() => { setModalMode('subscribe'); setAccepted(false); setShowTerms(true); }}
                      className="bg-[#0066FF] hover:bg-[#0052cc] text-white font-bold flex items-center gap-3 py-4 px-8 rounded-2xl transition-all hover:-translate-y-1 shadow-xl shadow-blue-500/30 text-lg w-max"
                    >
                      <Shield className="w-6 h-6" /> Activate Protection Plan
                    </button>
                  )}

                  {isPolicyActive && !loadingPolicy && (
                    <div className="space-y-8 bg-[#141414]/50 backdrop-blur-lg p-6 rounded-3xl border border-white/5">
                      <div className="flex flex-col sm:flex-row items-center gap-4">
                        <div className="bg-[#1C1C1C] px-8 py-5 rounded-2xl border border-white/5 w-full sm:w-auto shadow-inner">
                          <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mb-1">Weekly Premium</p>
                          <p className="text-4xl font-black text-[#0066FF]">₹{activePolicy.policy_cost}</p>
                        </div>
                        <button
                          onClick={() => { setModalMode('renew'); setAccepted(false); setShowTerms(true); }}
                          disabled={renewing || !canRenew}
                          className={`w-full sm:flex-1 font-bold flex justify-center items-center py-6 px-6 rounded-2xl transition-all text-lg shadow-lg ${
                            canRenew
                              ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 shadow-emerald-500/20 text-white hover:-translate-y-1'
                              : 'bg-[#222] text-gray-500 border border-[#333] cursor-not-allowed'
                          }`}
                        >
                          {renewing ? "Processing Payment..." : canRenew ? "Renew Coverage" : "Fully Covered ✅"}
                        </button>
                      </div>
                      
                      {/* Chit Fund Progress Component */}
                      {(() => {
                        const STREAK_TARGET = 24;
                        const weeks = activePolicy.cumulative_weeks_count || 0;
                        const progress = Math.min((weeks / STREAK_TARGET) * 100, 100);
                        return (
                           <div className="pt-2">
                             <div className="flex justify-between items-end mb-3">
                               <div>
                                 <p className="text-sm font-bold text-gray-300">Loyalty Savings Streak</p>
                                 <p className="text-xs text-gray-500 mt-0.5">Reach 24 weeks for up to 85% cashback.</p>
                               </div>
                               <span className="text-2xl font-black text-white">{weeks} <span className="text-gray-500 text-sm font-medium">/ 24 wks</span></span>
                             </div>
                             <div className="w-full bg-[#1A1A1A] rounded-full h-4 border border-white/5 overflow-hidden shadow-inner">
                               <div
                                 className="h-full rounded-full bg-gradient-to-r from-[#0066FF] to-cyan-400 transition-all duration-1000 relative"
                                 style={{ width: `${progress}%` }}
                               >
                                  <div className="absolute inset-0 bg-white/20 w-full animate-pulse"></div>
                               </div>
                             </div>
                           </div>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {/* Right Side Stats Panel */}
                {isPolicyActive && (
                  <div className="w-full lg:w-96 flex flex-col gap-4">
                    <div className="bg-[#1C1C1C]/80 backdrop-blur-md p-8 rounded-[2rem] border border-white/5 shadow-xl flex-grow">
                      <h3 className="text-xs text-gray-500 font-bold uppercase tracking-widest mb-6">Status Terminal</h3>
                      <div className="flex items-center gap-4 mb-8">
                        <div className={`p-4 rounded-2xl ${activePolicy?.status === 'active' ? 'bg-green-500/10' : 'bg-yellow-500/10'}`}>
                          <ShieldCheck className={`w-10 h-10 ${activePolicy?.status === 'active' ? 'text-green-500' : 'text-yellow-500'}`} />
                        </div>
                        <div>
                          <p className={`text-3xl font-black tracking-tight ${activePolicy?.status === 'active' ? 'text-green-400' : 'text-yellow-400'}`}>
                            {activePolicy?.status.toUpperCase()}
                          </p>
                          <p className="text-sm text-gray-400 mt-1">System monitoring active.</p>
                        </div>
                      </div>
                      
                      <div className="bg-[#141414] rounded-2xl p-5 border border-white/5">
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Time until next cycle</p>
                        <p className="text-xl font-bold text-white flex items-center gap-2"><Clock className="w-5 h-5 text-[#0066FF]"/> {daysUntilReset} days left</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Row Grids for Layout Filling */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pb-4">
               <div className="bg-[#1C1C1C]/50 backdrop-blur-sm border border-white/5 rounded-3xl p-8 flex flex-col justify-center">
                  <div className="w-12 h-12 bg-purple-500/10 rounded-xl flex items-center justify-center mb-6">
                     <Activity className="w-6 h-6 text-purple-400"/>
                  </div>
                  <h4 className="text-xl font-bold text-white mb-2">How 4-Gate Works</h4>
                  <p className="text-sm text-gray-400 leading-relaxed max-w-sm">
                     InFin relies on a sophisticated 4-Gate engine combining Weather APIs (Gate 1), Peer Analytics (Gate 2), Time Eligibility (Gate 3), and Anti-Spoofing checks (Gate 4) to ensure your payouts are fast and fair.
                  </p>
               </div>
               
               <div className="bg-[#1C1C1C]/50 backdrop-blur-sm border border-white/5 rounded-3xl p-8 flex flex-col justify-center">
                  <h4 className="text-xl font-bold text-white mb-2">Need Immediate Help?</h4>
                  <p className="text-sm text-gray-400 leading-relaxed mb-6">Our priority support desk is available 24/7 to resolve technical queries or guide you through the process.</p>
                  <div className="flex gap-4">
                    <button className="bg-[#2B2B2B] hover:bg-[#333] border border-white/5 px-6 py-3 rounded-xl flex items-center gap-2 font-bold text-sm transition-colors shadow-lg"><Mail className="w-4 h-4 text-[#0066FF]"/> Email Support</button>
                    <button className="bg-white/5 hover:bg-white/10 border border-white/5 px-6 py-3 rounded-xl flex items-center gap-2 font-bold text-sm transition-colors"><Phone className="w-4 h-4 text-green-400"/> Contact Line</button>
                  </div>
               </div>
            </div>
          </div>
        )}

        {/* Tab: ENVIRONMENT */}
        {activeTab === 'environment' && (
          <div className="animate-fade-in flex flex-col flex-grow">
            <h2 className="text-3xl font-black mb-8 text-white">Zone Telemetry & Signals</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Weather Panel */}
              <div className="bg-[#1C1C1C] p-8 rounded-[2rem] border border-white/5 shadow-2xl relative overflow-hidden group">
                <CloudLightning className="absolute -bottom-8 -right-8 w-40 h-40 text-[#0066FF] opacity-5 group-hover:scale-110 transition-transform duration-700 pointer-events-none" />
                <div className="flex justify-between items-start mb-10 relative z-10">
                  <div className="flex items-center gap-2 text-gray-400 font-bold"><MapPin className="w-5 h-5 text-[#0066FF]"/> {weather?.city || 'Weather'}</div>
                  {weather?.trust_score && <span className="bg-green-500/10 text-green-400 text-xs px-3 py-1.5 rounded-full font-bold">API Verified</span>}
                </div>
                <div className="mb-10 relative z-10">
                  <h1 className="text-6xl font-black text-white">{weather ? `${Math.round(weather.temperature_c)}°` : '--°'}</h1>
                  <p className="text-xl text-gray-400 font-medium mt-2">{weather?.condition || 'Awaiting Signal...'}</p>
                </div>
                <div className="grid grid-cols-2 gap-6 border-t border-white/5 pt-6 relative z-10">
                  <div>
                    <span className="text-gray-500 text-[10px] uppercase font-bold tracking-widest">Rainfall</span>
                    <p className="font-bold text-lg">{weather ? `${weather.rain_cm_display} cm` : '--'}</p>
                  </div>
                  <div>
                     <span className="text-gray-500 text-[10px] uppercase font-bold tracking-widest">Humidity</span>
                     <p className="font-bold text-lg">{weather ? `${weather.humidity}%` : '--'}</p>
                  </div>
                </div>
              </div>

              {/* AQI Panel */}
              <div className="bg-[#1C1C1C] p-8 rounded-[2rem] border border-white/5 shadow-2xl relative overflow-hidden group">
                <Wind className="absolute -bottom-8 -right-8 w-40 h-40 text-emerald-500 opacity-5 group-hover:scale-110 transition-transform duration-700 pointer-events-none" />
                <div className="flex justify-between items-start mb-10 relative z-10">
                  <div className="flex items-center gap-2 text-gray-400 font-bold"><Wind className="w-5 h-5 text-emerald-500"/> Air Quality Engine</div>
                  {aqi?.trust_score && <span className="bg-green-500/10 text-green-400 text-xs px-3 py-1.5 rounded-full font-bold">API Verified</span>}
                </div>
                <div className="mb-8 relative z-10">
                  <h1 className="text-6xl font-black text-white">{aqi ? Math.round(aqi.aqi) : '--'}</h1>
                  <p className="text-xl text-emerald-400 font-medium mt-2">{aqi?.risk_level || 'Awaiting Signal...'}</p>
                </div>
                {aqi && (
                  <p className="text-sm font-medium text-gray-400 bg-[#141414] p-4 rounded-2xl mb-8 border border-white/5 relative z-10 shadow-inner">
                    {aqi.health_advisory}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-6 border-t border-white/5 pt-6 relative z-10">
                  <div>
                    <span className="text-gray-500 text-[10px] uppercase font-bold tracking-widest">PM2.5</span>
                    <p className="font-bold text-lg">{aqi ? `${aqi.pm2_5.toFixed(1)} µg/m³` : '--'}</p>
                  </div>
                  <div>
                     <span className="text-gray-500 text-[10px] uppercase font-bold tracking-widest">PM10</span>
                     <p className="font-bold text-lg">{aqi ? `${aqi.pm10.toFixed(1)} µg/m³` : '--'}</p>
                  </div>
                </div>
              </div>

              {/* News Panel */}
              <div className="bg-[#1C1C1C] p-8 rounded-[2rem] border border-white/5 shadow-2xl relative overflow-hidden group">
                <Newspaper className="absolute -bottom-8 -right-8 w-40 h-40 text-orange-500 opacity-5 group-hover:scale-110 transition-transform duration-700 pointer-events-none" />
                <div className="flex justify-between items-start mb-8 relative z-10">
                  <div className="flex items-center gap-2 text-gray-400 font-bold"><Radio className="w-5 h-5 text-orange-500"/> Scraper Alerts</div>
                  {news?.trust_score && <span className="bg-green-500/10 text-green-400 text-xs px-3 py-1.5 rounded-full font-bold">API Verified</span>}
                </div>
                
                {!news ? (
                   <div className="h-full flex flex-col items-center justify-center pb-12">
                      <ShieldCheck className="w-12 h-12 text-gray-600 mb-4 opacity-50" />
                      <p className="text-gray-500 font-medium">No socio-political disruptions found.</p>
                   </div>
                ) : (
                  <div className="relative z-10 flex flex-col h-full">
                    <span className="bg-orange-500/10 text-orange-400 text-xs px-3 py-1.5 rounded-full font-bold mb-4 inline-block w-max border border-orange-500/20">{news.severity} Impact</span>
                    <h4 className="text-xl font-black text-white mb-6 leading-snug">{news.headline}</h4>
                    
                    <div className="mt-auto border-t border-white/5 pt-6">
                      <span className="text-gray-500 text-[10px] uppercase font-bold tracking-widest block mb-2">Keywords Detected</span>
                      <p className="text-base font-bold bg-[#141414] px-4 py-3 rounded-xl border border-white/5 inline-block">{news.affected_services}</p>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Wide Map / Info Graphic Placeholder */}
              <div className="col-span-1 lg:col-span-3 bg-gradient-to-r from-[#1C1C1C] to-[#2B2B2B] border border-white/5 rounded-[2rem] p-10 shadow-2xl mt-4 flex flex-col lg:flex-row items-center justify-between min-h-[300px] relative overflow-hidden group">
                 <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at center, #0066FF 1px, transparent 1px)', backgroundSize: '30px 30px' }}></div>
                 
                 <div className="relative z-10 max-w-xl text-center lg:text-left mb-8 lg:mb-0">
                    <h3 className="text-3xl font-black text-white flex items-center justify-center lg:justify-start gap-4 mb-4"><MapPin className="w-8 h-8 text-[#0066FF]"/> Live Ward Coverage Map</h3>
                    <p className="text-gray-400 text-lg leading-relaxed">Your premium coverage dynamically spans across multiple wards. When severe disruption hits, the engine isolates the exact coordinates to ensure your area qualifies efficiently and accurately.</p>
                    <button className="mt-8 px-8 py-3 bg-[#0066FF] hover:bg-[#0052cc] rounded-xl font-bold transition-all shadow-xl shadow-blue-500/20">Expand Viewer Matrix</button>
                 </div>
                 
                 <div className="relative z-10 w-full lg:w-1/2 aspect-video bg-[#141414] border border-white/10 rounded-2xl flex items-center justify-center shadow-inner overflow-hidden">
                    <iframe 
                       width="100%" 
                       height="100%" 
                       frameBorder="0" 
                       scrolling="no" 
                       marginHeight="0" 
                       marginWidth="0" 
                       src={`https://maps.google.com/maps?q=${weather?.city || user?.city || 'India'}&t=&z=11&ie=UTF8&iwloc=&output=embed`}
                       className="w-full h-full"
                       style={{ filter: "invert(100%) hue-rotate(180deg) contrast(110%) sepia(20%) saturate(150%)", opacity: 0.8 }}
                    ></iframe>
                 </div>
              </div>
              
            </div>
          </div>
        )}

        {/* Tab: HISTORY */}
        {activeTab === 'history' && (
          <div className="animate-fade-in w-full flex flex-col flex-grow">
            <h2 className="text-3xl font-black mb-8 text-white">Financial Statement & History</h2>
            
            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
               <div className="bg-[#1C1C1C] border border-white/5 p-8 rounded-3xl shadow-xl hover:bg-[#222] transition-colors">
                  <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-3">Total Processed Value</p>
                  <p className="text-4xl font-black text-white">₹{combinedHistory.filter(h => h.status === 'approved' || h.type === 'bonus').reduce((acc, curr) => acc + Number(curr.final_payout || curr.return_amount || 0), 0)}</p>
               </div>
               <div className="bg-[#1C1C1C] border border-white/5 p-8 rounded-3xl shadow-xl hover:bg-[#222] transition-colors">
                  <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-3">Loyalty Bonuses</p>
                  <p className="text-4xl font-black text-[#0066FF]">{combinedHistory.filter(h => h.type === 'bonus').length}</p>
               </div>
               <div className="bg-[#1C1C1C] border border-white/5 p-8 rounded-3xl shadow-xl hover:bg-[#222] transition-colors">
                  <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-3">Claims Assessed</p>
                  <p className="text-4xl font-black text-emerald-400">{allClaims.length}</p>
               </div>
            </div>

            <div className="bg-[#1C1C1C] border border-white/5 rounded-3xl overflow-hidden shadow-2xl flex-grow flex flex-col">
              {combinedHistory.length === 0 ? (
                <div className="p-20 text-center flex flex-col items-center flex-grow justify-center">
                  <div className="w-24 h-24 bg-[#141414] rounded-full flex items-center justify-center mb-6 border border-white/5">
                     <History className="w-10 h-10 text-gray-600" />
                  </div>
                  <h3 className="text-2xl font-bold text-white">No Ledger History</h3>
                  <p className="text-gray-500 max-w-md mt-4 text-lg">You haven't accumulated any payouts or filed claims yet. Events will systematically build your ledger here.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-[#222]/50 backdrop-blur-md">
                      <tr>
                        <th className="p-6 text-xs font-bold text-gray-500 uppercase tracking-widest">Date Issued</th>
                        <th className="p-6 text-xs font-bold text-gray-500 uppercase tracking-widest">Transaction Type</th>
                        <th className="p-6 text-xs font-bold text-gray-500 uppercase tracking-widest">Value (INR)</th>
                        <th className="p-6 text-xs font-bold text-gray-500 uppercase tracking-widest text-right">Settlement Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {combinedHistory.map((item, idx) => (
                        <tr key={item.id || idx} className="hover:bg-[#2B2B2B] transition-colors group">
                          <td className="p-6 text-sm font-medium text-gray-300 group-hover:text-white transition-colors">{new Date(item.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</td>
                          <td className="p-6">
                            <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold shadow-sm ${
                              item.type === 'bonus' ? 'bg-[#0066FF]/10 text-[#0066FF] border border-[#0066FF]/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            }`}>
                              {item.type === 'bonus' ? 'Loyalty Chit Bonus' : 'Disruption Policy Claim'}
                            </span>
                          </td>
                          <td className="p-6 text-lg font-black text-white">
                            ₹{item.type === 'bonus' ? item.return_amount : item.final_payout}
                          </td>
                          <td className="p-6 text-right">
                            <span className={`text-xs font-black uppercase tracking-widest px-3 py-1.5 rounded max-w-max ml-auto text-center ${
                              item.status === 'approved' || item.type === 'bonus' ? 'bg-green-500/10 text-green-500' : 'bg-yellow-500/10 text-yellow-500'
                            }`}>
                              {item.type==='bonus' ? 'Credited' : item.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab: EARNINGS UPLOAD */}
        {activeTab === 'earnings' && (
          <div className="animate-fade-in w-full flex flex-col flex-grow">
            <h2 className="text-3xl font-black mb-8 text-white">Income Validation Portal</h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 flex-grow">
                <div className="col-span-1 lg:col-span-2 flex flex-col">
                  <div 
                    className={`border-2 border-dashed rounded-[2rem] p-12 flex flex-col items-center justify-center transition-all duration-300 flex-grow shadow-2xl relative overflow-hidden ${
                      dragActive ? 'border-[#0066FF] bg-[#0066FF]/10 shadow-[0_0_50px_rgba(0,102,255,0.2)]' : 'border-gray-700 bg-[#1C1C1C] hover:bg-[#222]'
                    }`}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                  >
                    {dragActive && <div className="absolute inset-0 bg-[#0066FF]/5 pointer-events-none"></div>}
                    
                    <FileImage className={`w-24 h-24 mb-6 transition-colors duration-300 ${dragActive ? 'text-[#0066FF] scale-110' : 'text-gray-600'}`} />
                    <h3 className="text-2xl font-black text-white mb-3">Drop Screenshots Here</h3>
                    <p className="text-gray-500 text-base mb-8 max-w-sm text-center">Capture your Swiggy, Zomato, or Zepto earnings history page and upload them directly.</p>
                    
                    <input 
                      ref={fileInputRef} 
                      type="file" 
                      multiple 
                      accept="image/*" 
                      className="hidden" 
                      onChange={handleFileChange}
                    />
                    <button 
                      onClick={() => fileInputRef.current.click()}
                      className="bg-white text-black font-black py-4 px-10 rounded-xl hover:bg-gray-200 transition-all hover:-translate-y-1 active:-translate-y-0 shadow-xl"
                    >
                      Browse Files
                    </button>
                    <p className="text-gray-600 text-xs mt-6 font-bold tracking-widest uppercase">Supports local JPG, PNG up to 10MB</p>
                  </div>

                  {uploadedFiles.length > 0 && (
                    <div className="mt-10 bg-[#1C1C1C] p-8 rounded-[2rem] border border-white/5 shadow-2xl">
                      <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6 flex items-center justify-between">
                         Selected Documents 
                         <span className="bg-[#0066FF]/20 text-[#0066FF] px-3 py-1 rounded-full text-xs font-black">{uploadedFiles.length} item(s)</span>
                      </h4>
                      
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
                        {uploadedFiles.map((file, idx) => (
                          <div key={idx} className="relative group rounded-2xl overflow-hidden bg-[#141414] border border-white/10 aspect-[3/4] flex items-center justify-center shadow-lg">
                             <img src={URL.createObjectURL(file)} alt="preview" className="object-cover w-full h-full opacity-80 group-hover:opacity-30 transition-all duration-300 group-hover:scale-105" />
                             
                             <button 
                               onClick={() => removeFile(idx)}
                               className="absolute inset-0 m-auto w-12 h-12 bg-red-500/90 backdrop-blur-sm rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-red-600 shadow-2xl hover:scale-110"
                             >
                               <Trash2 className="w-5 h-5 text-white" />
                             </button>
                             <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded-md text-[10px] font-bold shadow-md">IMG_00{idx+1}</div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-8 flex justify-end">
                         <button 
                           onClick={() => { alert('In this frontend design prototype, images are handled successfully in state, but not vaulted to a backend.'); setUploadedFiles([]); }}
                           className="bg-gradient-to-r from-[#0066FF] to-blue-500 hover:from-blue-600 hover:to-blue-500 text-white font-black py-4 px-10 rounded-xl flex items-center shadow-2xl shadow-blue-500/20 transition-all hover:-translate-y-1"
                         >
                           <UploadCloud className="w-5 h-5 mr-3" />
                           Commit & Vault {uploadedFiles.length} File{uploadedFiles.length > 1 ? 's' : ''}
                         </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="col-span-1 flex flex-col gap-6">
                   <div className="bg-[#1C1C1C] p-8 rounded-3xl border border-white/5 shadow-2xl">
                      <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6">
                         <Lock className="w-6 h-6 text-emerald-400"/>
                      </div>
                      <h4 className="text-xl font-bold text-white mb-3">Privacy Guarantee</h4>
                      <p className="text-sm text-gray-400 leading-relaxed">Your screenshots are instantly processed by optical character recognition (OCR) and safely vaulted. None of your raw image data is exposed or shared with third parties. Used strictly for premium calculations.</p>
                   </div>
                   
                   <div className="bg-[#1C1C1C] p-8 rounded-3xl border border-white/5 shadow-2xl">
                      <div className="w-12 h-12 bg-purple-500/10 rounded-full flex items-center justify-center mb-6">
                         <Eye className="w-6 h-6 text-purple-400"/>
                      </div>
                      <h4 className="text-xl font-bold text-white mb-3">Why are we asking?</h4>
                      <p className="text-sm text-gray-400 leading-relaxed mb-6">Because platform APIs are locked, proving your baseline earnings allows us to accurately underwrite policy floors. Precise data results in cheaper premiums and higher payout thresholds.</p>
                      <button className="text-[#0066FF] text-sm font-bold flex items-center gap-1 hover:underline">Read the methodology <ChevronRight className="w-4 h-4"/></button>
                   </div>
                </div>
            </div>
          </div>
        )}

      </main>

      {/* Terms Modal */}
      {showTerms && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="bg-[#1C1C1C] w-full max-w-xl rounded-[2rem] border border-white/10 shadow-2xl flex flex-col overflow-hidden transform scale-100">
            <div className="flex justify-between items-center p-8 border-b border-white/5">
              <h3 className="text-2xl font-black text-white">Coverage Terms Matrix</h3>
              <button onClick={() => setShowTerms(false)} className="text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 p-2 rounded-full transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-8">
              <p className="text-gray-300 mb-8 leading-relaxed text-base">
                InFin operates on a strict parametric insurance model. Claims are calculated entirely via automated algorithmic logic processing environmental triggers. You understand that payouts are governed by Engine 2 (4-Gate processing).
              </p>
              <label className="flex items-start gap-4 cursor-pointer group bg-[#141414] p-5 rounded-2xl border border-white/5">
                <input 
                  type="checkbox" 
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                  className="w-6 h-6 mt-0.5 rounded border-[#444] text-[#0066FF] focus:ring-[#0066FF] bg-[#222]"
                />
                <span className="text-base text-gray-300 group-hover:text-white transition-colors font-medium">
                  I accept the automated conditions of the parametric policy suite.
                </span>
              </label>
            </div>
            <div className="p-8 border-t border-white/5 flex gap-4 justify-end bg-[#141414]">
              <button 
                onClick={() => setShowTerms(false)} 
                className="px-8 py-4 rounded-xl font-bold text-gray-400 hover:text-white transition-colors"
               >
                 Cancel Action
               </button>
              <button 
                onClick={handleAccept}
                disabled={!accepted}
                className={`px-10 py-4 rounded-xl font-black transition-all ${accepted ? 'bg-gradient-to-r from-[#0066FF] to-blue-500 hover:from-blue-600 hover:to-blue-500 text-white shadow-2xl shadow-blue-500/20 hover:-translate-y-1' : 'bg-[#222] text-gray-600 border border-[#333] cursor-not-allowed'}`}
              >
                {modalMode === 'subscribe' ? 'Acknowledge & Continue' : 'Acknowledge & Renew'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
