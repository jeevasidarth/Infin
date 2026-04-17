import React, { useState, useEffect } from 'react';
import { Shield, ChevronRight, X, ExternalLink, ShieldCheck, Clock, AlertCircle, CloudLightning, Radio, CheckCircle, MapPin, Mail, Phone, Wind, Newspaper } from 'lucide-react';
import { supabase } from '../supabase';
import { API_BASE_URL } from '../config';

const Dashboard = ({ user, onLogout, onGoToPolicy, triggerRazorpay }) => {
  const [showTerms, setShowTerms] = useState(false);
  const [showFullTerms, setShowFullTerms] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [modalMode, setModalMode] = useState('subscribe');

  const [activePolicy, setActivePolicy] = useState(null);
  const [allClaims, setAllClaims] = useState([]);
  const [loyaltySettlements, setLoyaltySettlements] = useState([]);
  const [loadingPolicy, setLoadingPolicy] = useState(true);
  const [renewing, setRenewing] = useState(false);
  const [renewalFeedback, setRenewalFeedback] = useState(null);
  const [disruptionStage, setDisruptionStage] = useState(0); 
  const [newPayoutAlert, setNewPayoutAlert] = useState(null); // { id, type, amount }
  const [weather, setWeather] = useState(null);
  const [loadingWeather, setLoadingWeather] = useState(true);
  const [aqi, setAqi] = useState(null);
  const [loadingAqi, setLoadingAqi] = useState(true);
  const [news, setNews] = useState(null);
  const [loadingNews, setLoadingNews] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const id = user?.id || user?.worker_id;
        if (!id) return;
        
        // Fetch Current Policy (Active or Pending)
        const { data: activeData, error: activeErr } = await supabase
          .from('policies')
          .select('*')
          .eq('worker_id', id)
          .in('status', ['active', 'pending'])
          .single();
          
        if (activeData && !activeErr) {
          setActivePolicy(activeData);
        } else {
          setActivePolicy(null);
        }

        // Fetch All Policies (to get all related claims and settlements)
        const pols = await supabase.from('policies').select('id').eq('worker_id', id);
        if (pols.data && pols.data.length > 0) {
           const p_ids = pols.data.map(p => p.id);
           
           // Fetch Claims
           const {data: claimsData, error: claimsErr} = await supabase
             .from('claims')
             .select('*')
             .in('policy_id', p_ids)
             .order('created_at', {ascending: false});
             
           if (claimsData && !claimsErr) {
             setAllClaims(claimsData);
           }

           // Fetch Loyalty Settlements
           const {data: settlementsData, error: settlementsErr} = await supabase
             .from('loyalty_settlements')
             .select('*')
             .in('policy_id', p_ids)
             .order('settled_at', {ascending: false});

           if (settlementsData && !settlementsErr) {
              setLoyaltySettlements(settlementsData);
           }

           // Check for New (Unseen) Payouts
           const seenIds = JSON.parse(localStorage.getItem(`seen_payouts_${id}`) || '[]');
           
           // Recent approved claim?
           const newClaim = claimsData?.find(c => c.status === 'approved' && !seenIds.includes(c.id));
           // Recent loyalty bonus?
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
        if (res.ok) {
          const data = await res.json();
          setWeather(data);
        }
      } catch (err) {
        console.error("Error fetching weather:", err);
      } finally {
        setLoadingWeather(false);
      }
    };
    fetchWeather();
  }, [user]);

  useEffect(() => {
    const fetchAqi = async () => {
      if (!user?.city) return;
      try {
        const res = await fetch(`${API_BASE_URL}/api/aqi/${user.city}`);
        if (res.ok) {
          const data = await res.json();
          setAqi(data);
        }
      } catch (err) {
        console.error('Error fetching AQI:', err);
      } finally {
        setLoadingAqi(false);
      }
    };
    fetchAqi();
  }, [user]);

  useEffect(() => {
    const fetchNews = async () => {
      if (!user?.city) return;
      try {
        const res = await fetch(`${API_BASE_URL}/api/news/${user.city}`);
        if (res.ok) {
          const data = await res.json();
          setNews(data);
        }
      } catch (err) {
        console.error('Error fetching News:', err);
      } finally {
        setLoadingNews(false);
      }
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

  // Merge claims and settlements for history
  const combinedHistory = [
    ...allClaims.map(c => ({ ...c, type: 'claim', date: c.created_at })),
    ...loyaltySettlements.map(s => ({ ...s, type: 'bonus', date: s.settled_at }))
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  const isPolicyActive = !!activePolicy;
  
  let daysUntilReset = 0;
  if (isPolicyActive && activePolicy.next_due_date) {
    const nextDue = new Date(activePolicy.next_due_date);
    const now = new Date();
    const diffTime = nextDue - now;
    daysUntilReset = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
  }
  const canRenew = isPolicyActive && activePolicy.cumulative_weeks_count < 2;

  const handleRenewPolicy = async () => {
    if (!activePolicy) return;
    setRenewing(true);
    setRenewalFeedback(null);
    
    // RAZORPAY INTEGRATION
    await triggerRazorpay(activePolicy.policy_cost, async (paymentResponse) => {
        try {
          const res = await fetch(`${API_BASE_URL}/api/v1/policy/renew`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ policy_id: activePolicy.id })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.detail || "Failed to renew policy");
          
          setActivePolicy({
            ...activePolicy,
            cumulative_weeks_count: data.cumulative_weeks_count,
            cumulative_amount_collected: data.cumulative_amount_collected,
            next_due_date: data.next_due_date
          });
          setRenewalFeedback({ type: 'success', message: 'Policy renewed successfully for another week!' });
          setTimeout(() => setRenewalFeedback(null), 5000);
        } catch (err) {
          console.error(err);
          setRenewalFeedback({ type: 'error', message: err.message });
        } finally {
          setRenewing(false);
        }
    });

    // Reset button state if modal is closed or after a delay
    setTimeout(() => setRenewing(false), 2000);
  };

  const handleAccept = () => {
    setShowTerms(false);
    if (modalMode === 'subscribe') {
      onGoToPolicy();
    } else {
      handleRenewPolicy();
    }
  };

  return (
    <div className="min-h-screen bg-[#1F1F1F] p-4 md:p-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <ShieldCheck className="text-[#0066FF] w-8 h-8"/> InFin
        </h1>
        <button
          onClick={onLogout}
          className="text-gray-400 hover:text-white transition-colors border border-white/10 px-4 py-2 rounded-lg"
        >
          Logout
        </button>
      </div>

      {/* Notifications Area */}
      <div className="max-w-4xl mx-auto mb-6 space-y-4">
        {/* New Payout Alert (One-time) */}
        {newPayoutAlert && (
           <div className="bg-green-500/20 border-2 border-green-500 rounded-xl p-6 flex flex-col md:flex-row items-center gap-6 shadow-2xl shadow-green-500/10 animate-fade-in">
             <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center shrink-0">
               <ShieldCheck className="text-white w-10 h-10"/>
             </div>
             <div className="flex-1 text-center md:text-left">
               <h3 className="text-2xl font-black text-white mb-1">
                 {newPayoutAlert.type === 'bonus' ? '🎊 Loyalty Bonus Received!' : '✅ Insurance Claim Paid!'}
               </h3>
               <p className="text-green-300/80">
                 A payout of <strong className="text-white text-xl">₹{newPayoutAlert.amount}</strong> has been successfully credited to your linked UPI.
               </p>
             </div>
             <button 
               onClick={dismissPayoutAlert}
               className="bg-white/10 hover:bg-white/20 text-white px-6 py-2 rounded-lg font-bold transition-all"
             >
               Dismiss
             </button>
           </div>
        )}

        {loyaltySettlements.length > 0 && !newPayoutAlert && new Date(loyaltySettlements[0].settled_at) > new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) && (
           <div className="bg-[#0066FF]/20 border border-[#0066FF]/50 rounded-xl p-4 flex items-start gap-4">
             <ShieldCheck className="text-[#0066FF] w-6 h-6 flex-shrink-0 mt-1"/>
             <div>
               <h3 className="text-[#0066FF] font-bold mb-1 border-b border-[#0066FF]/20 pb-1">Chit Fund Cycle Complete!</h3>
               <p className="text-gray-300 text-sm">Congratulations! You've maintained an unbroken 24-week streak. We have returned <strong className="text-white text-base">₹{loyaltySettlements[0].return_amount}</strong> ({loyaltySettlements[0].return_percentage * 100}%) to your account as a loyalty bonus. Your new streak starts from zero!</p>
             </div>
           </div>
        )}

        {allClaims.length > 0 && (
          <>
            {allClaims[0].status === 'pending' && (
              <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-xl p-4 flex items-start gap-4 animate-pulse">
                <AlertCircle className="text-yellow-500 w-6 h-6 flex-shrink-0 mt-1"/>
                <div>
                  <h3 className="text-yellow-500 font-bold mb-1 border-b border-yellow-500/20 pb-1">Severe Weather Disruption Detected</h3>
                  <p className="text-gray-300 text-sm">Your policy is currently tracking an ongoing disruption actively affecting your zone. No action is required from your side. We will evaluate your earnings and process any legitimate claims once the weather normalizes.</p>
                </div>
              </div>
            )}
            {allClaims[0].status === 'approved' && (
              <div className="bg-green-500/20 border border-green-500/50 rounded-xl p-4 flex items-start gap-4">
                <CheckCircle className="text-green-500 w-6 h-6 flex-shrink-0 mt-1"/>
                <div>
                  <h3 className="text-green-500 font-bold mb-1 border-b border-green-500/20 pb-1">Claim Approved & Paid!</h3>
                  <p className="text-gray-300 text-sm">The recent extreme weather completely disrupted your operations. We have automatically credited a payout of <strong className="text-white text-base">₹{allClaims[0].final_payout}</strong> to your account. Stay safe out there!</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Main Content Area */}
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Welcome Card */}
        <div className="bg-[#2B2B2B] rounded-2xl p-8 border border-white/5 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#0066FF]/10 rounded-full blur-[80px] pointer-events-none"></div>
          
          <h2 className="text-3xl font-bold text-white mb-2">Hello, {user?.platform || 'Worker'} Partner!</h2>
          <p className="text-gray-400 mb-8 max-w-md">
            Protect your daily earnings against unexpected weather and zone disruptions. No claims to file, just peace of mind.
          </p>

          {!isPolicyActive && !loadingPolicy && (
            <button
              onClick={() => { setModalMode('subscribe'); setAccepted(false); setShowTerms(true); }}
              className="bg-[#0066FF] hover:bg-[#0052cc] text-white font-semibold flex items-center gap-2 py-4 px-8 rounded-xl transition-all hover:scale-[1.02] shadow-lg shadow-blue-500/20 text-lg"
            >
              <Shield className="w-5 h-5" /> Get Insurance Now <ChevronRight className="w-5 h-5" />
            </button>
          )}

          {isPolicyActive && !loadingPolicy && (
            <div className="mt-6 flex flex-col gap-4">
              {/* Loyalty Bonus Progress */}
              {(() => {
                const STREAK_TARGET = 24;
                const weeks = activePolicy.cumulative_weeks_count || 0;
                const amount = activePolicy.cumulative_amount_collected || 0;
                const progress = Math.min((weeks / STREAK_TARGET) * 100, 100);
                const weeksLeft = Math.max(0, STREAK_TARGET - weeks);
                const estimatedReturn = Math.round(amount * 0.85);
                const isComplete = weeks >= STREAK_TARGET;
                return (
                  <div className="bg-[#1A1A1A] rounded-xl p-4 border border-[#333]">
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-sm text-gray-400">Chit Fund Streak</p>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isComplete ? 'bg-green-500/20 text-green-400' : 'bg-[#0066FF]/10 text-[#0066FF]'}`}>
                        {isComplete ? '🎉 Eligible for Bonus!' : `${weeksLeft} weeks to go`}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1 mb-3">
                      <span className="text-2xl font-bold text-white">{weeks}</span>
                      <span className="text-gray-500 text-sm">/ {STREAK_TARGET} weeks</span>
                    </div>
                    <div className="w-full bg-[#2B2B2B] rounded-full h-2 mb-3 overflow-hidden">
                      <div
                        className={`h-2 rounded-full transition-all duration-700 ${isComplete ? 'bg-gradient-to-r from-green-500 to-emerald-400' : 'bg-gradient-to-r from-[#0066FF] to-blue-400'}`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Total invested: <span className="text-white font-medium">₹{amount}</span></span>
                      <span>Est. return (no claims): <span className="text-green-400 font-medium">₹{estimatedReturn}</span></span>
                    </div>
                  </div>
                );
              })()}

              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 bg-[#1A1A1A] rounded-xl p-4 border border-[#333]">
                  <p className="text-sm text-gray-400 mb-1">Weekly Premium</p>
                  <p className="text-2xl font-bold text-[#0066FF]">₹{activePolicy.policy_cost}</p>
                </div>
                <button
                  onClick={() => { setModalMode('renew'); setAccepted(false); setShowTerms(true); }}
                  disabled={renewing || !canRenew}
                  className={`flex-[2] text-white font-semibold flex items-center justify-center gap-2 py-4 px-6 rounded-xl transition-all hover:scale-[1.02] text-md disabled:scale-100 ${
                    canRenew
                      ? 'bg-green-600 hover:bg-green-500 shadow-lg shadow-green-500/20 disabled:opacity-50'
                      : 'bg-[#333] text-gray-500 cursor-not-allowed border border-[#444]'
                  }`}
                >
                  {renewing ? "Processing..." : canRenew ? `Continue Policy (Pay ₹${activePolicy.policy_cost} →)` : "Fully Covered for Next Week"}
                </button>
              </div>

              {renewalFeedback && (
                <div className={`p-4 rounded-xl text-center text-sm font-medium border animate-fade-in ${renewalFeedback.type === 'success' ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-red-500/10 text-red-500 border-red-500/30'}`}>
                  {renewalFeedback.message}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
          
          {/* Weather Card */}
          <div className="bg-[#2B2B2B] p-6 rounded-2xl border border-white/5 shadow-lg flex flex-col justify-between relative overflow-hidden group">
             <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                <CloudLightning className="w-16 h-16 text-[#0066FF]" />
             </div>
             
             <div>
                <div className="flex justify-between items-start mb-4">
                   <h3 className="text-sm text-gray-400 font-medium flex items-center gap-2">
                     <MapPin className="w-4 h-4 text-[#0066FF]" /> {weather?.city || user?.city || 'Local Weather'}
                   </h3>
                   {weather && (
                     <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${weather.trust_score > 0.8 ? 'bg-green-500/10 text-green-500' : 'bg-yellow-500/10 text-yellow-500'}`}>
                        <CheckCircle className="w-3 h-3" /> {weather.trust_score > 0.8 ? 'Verified' : 'Trusted'}
                     </div>
                   )}
                </div>

                <div className="flex items-end gap-3 mb-6">
                   <p className="text-4xl font-black text-white">{weather ? `${Math.round(weather.temperature_c)}°` : '--°'}</p>
                   <div className="flex flex-col">
                      <p className="text-white font-bold text-sm leading-tight">{weather?.condition || 'Loading...'}</p>
                      <p className="text-gray-500 text-[10px] uppercase tracking-wider">Condition</p>
                   </div>
                </div>
             </div>

             <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                <div>
                  <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">Precipitation</p>
                  <p className="text-sm font-bold text-white">{weather ? `${weather.rain_cm_display} cm` : '--'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">Humidity</p>
                  <p className="text-sm font-bold text-white">{weather ? `${weather.humidity}%` : '--'}</p>
                </div>
             </div>
             
             {weather && (
               <p className="text-[9px] text-gray-600 mt-4 flex items-center gap-1">
                 <Clock className="w-3 h-3" /> Updated {new Date(weather.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
               </p>
             )}
          </div>

          {/* AQI Card */}
          {(() => {
            const aqiColors = {
              'Good': { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
              'Moderate': { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/20' },
              'Unhealthy for Sensitive Groups': { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20' },
              'Unhealthy': { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
              'Very Unhealthy': { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20' },
              'Hazardous': { bg: 'bg-rose-900/30', text: 'text-rose-300', border: 'border-rose-500/30' },
            };
            const colors = aqiColors[aqi?.risk_level] || aqiColors['Good'];
            return (
              <div className="bg-[#2B2B2B] p-6 rounded-2xl border border-white/5 shadow-lg flex flex-col justify-between relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Wind className="w-16 h-16 text-emerald-500" />
                </div>

                <div>
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-sm text-gray-400 font-medium flex items-center gap-2">
                      <Wind className="w-4 h-4 text-emerald-500" /> Air Quality
                    </h3>
                    {aqi && (
                      <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${aqi.trust_score > 0.8 ? 'bg-green-500/10 text-green-500' : 'bg-yellow-500/10 text-yellow-500'}`}>
                        <CheckCircle className="w-3 h-3" /> {aqi.trust_score > 0.8 ? 'Verified' : 'Trusted'}
                      </div>
                    )}
                  </div>

                  <div className="flex items-end gap-3 mb-4">
                    <p className={`text-4xl font-black ${aqi ? colors.text : 'text-white'}`}>{aqi ? Math.round(aqi.aqi) : '--'}</p>
                    <div className="flex flex-col">
                      <p className={`font-bold text-sm leading-tight ${aqi ? colors.text : 'text-white'}`}>{aqi?.risk_level || 'Loading...'}</p>
                      <p className="text-gray-500 text-[10px] uppercase tracking-wider">AQI</p>
                    </div>
                  </div>

                  {aqi && (
                    <div className={`text-[10px] px-2 py-1.5 rounded-lg ${colors.bg} ${colors.text} ${colors.border} border mb-4 leading-relaxed`}>
                      {aqi.health_advisory}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">PM2.5</p>
                    <p className="text-sm font-bold text-white">{aqi ? `${aqi.pm2_5.toFixed(1)} µg/m³` : '--'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">PM10</p>
                    <p className="text-sm font-bold text-white">{aqi ? `${aqi.pm10.toFixed(1)} µg/m³` : '--'}</p>
                  </div>
                </div>

                {aqi && (
                  <p className="text-[9px] text-gray-600 mt-4 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Updated {new Date(aqi.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
            );
          })()}

          {/* News Disruption Card */}
          {(() => {
            const severityColors = {
              'High': { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/20', icon: 'text-rose-500' },
              'Medium': { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20', icon: 'text-orange-500' },
              'Low': { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20', icon: 'text-blue-500' },
            };
            const colors = severityColors[news?.severity] || severityColors['Low'];
            
            return (
              <div className="bg-[#2B2B2B] p-6 rounded-2xl border border-white/5 shadow-lg flex flex-col justify-between relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Newspaper className={`w-16 h-16 ${colors.icon}`} />
                </div>

                <div>
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-sm text-gray-400 font-medium flex items-center gap-2">
                       <Radio className={`w-4 h-4 ${colors.icon} ${news ? 'animate-pulse' : ''}`} /> Disruption News
                    </h3>
                    {news && (
                      <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${news.trust_score > 0.8 ? 'bg-green-500/10 text-green-500' : 'bg-yellow-500/10 text-yellow-500'}`}>
                        <CheckCircle className="w-3 h-3" /> {news.trust_score > 0.8 ? 'Verified' : 'Trusted'}
                      </div>
                    )}
                  </div>

                  {!news ? (
                    <div className="flex flex-col items-center justify-center h-32 text-gray-600 text-center">
                      <ShieldCheck className="w-8 h-8 mb-2 opacity-10" />
                      <p className="text-xs italic">No disruptions detected in last 24h</p>
                    </div>
                  ) : (
                    <>
                      <div className="mb-4">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${colors.bg} ${colors.text} border ${colors.border} uppercase tracking-tighter`}>
                          {news.severity} Impact
                        </span>
                        <h4 className="text-white font-bold text-sm mt-2 line-clamp-2 leading-snug">{news.headline}</h4>
                      </div>

                      <div className="bg-[#1A1A1A] p-3 rounded-xl border border-white/5 mb-4">
                        <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">Affected Services</p>
                        <p className="text-xs text-white line-clamp-1">{news.affected_services}</p>
                      </div>
                    </>
                  )}
                </div>

                {news && (
                  <p className="text-[9px] text-gray-600 mt-auto flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Reported {new Date(news.published_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
            );
          })()}

          {/* Insurance Status Card with Weekly Reset */}
          <div className="bg-[#2B2B2B] p-6 rounded-2xl border border-white/5 shadow-lg flex flex-col justify-between relative overflow-hidden">
            {isPolicyActive && (
              <div className={`absolute top-0 left-0 w-full h-1 ${activePolicy?.status === 'pending' ? 'bg-yellow-500/50' : 'bg-green-500/50'}`}></div>
            )}
            
            <div>
              <h3 className="text-sm text-gray-400 font-medium mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#0066FF]" /> Insurance Status
              </h3>
              <div className="flex items-center gap-3 mb-1">
                <span className="relative flex h-3 w-3">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    activePolicy?.status === 'active' ? 'bg-green-400' : 
                    activePolicy?.status === 'pending' ? 'bg-yellow-400' : 'bg-red-400'
                  }`}></span>
                  <span className={`relative inline-flex rounded-full h-3 w-3 ${
                    activePolicy?.status === 'active' ? 'bg-green-500' : 
                    activePolicy?.status === 'pending' ? 'bg-yellow-500' : 'bg-red-500'
                  }`}></span>
                </span>
                <p className={`text-2xl font-bold ${
                  activePolicy?.status === 'active' ? 'text-green-400' : 
                  activePolicy?.status === 'pending' ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {activePolicy?.status === 'active' ? 'Active' : 
                   activePolicy?.status === 'pending' ? 'Pending' : 'Inactive'}
                </p>
              </div>
            </div>
            
            <div className="mt-4 pt-4 border-t border-white/5">
              <div className="flex justify-between items-center text-sm mb-2">
                <span className="text-gray-400 flex items-center gap-1.5">
                  <Clock className="w-4 h-4" /> Weekly Reset
                </span>
                <span className={isPolicyActive ? "text-white font-medium" : "text-gray-500"}>
                  {isPolicyActive ? `${daysUntilReset} days left` : 'No active cycle'}
                </span>
              </div>
              
              {/* Progress Bar for Weekly Reset */}
              <div className="w-full bg-[#1A1A1A] rounded-full h-1.5 overflow-hidden">
                <div 
                  className={`h-1.5 rounded-full transition-all duration-500 ${isPolicyActive ? 'bg-gradient-to-r from-green-500 to-emerald-400' : 'bg-gray-700'}`} 
                  style={{ width: isPolicyActive ? `${(daysUntilReset / 7) * 100}%` : '0%' }}
                ></div>
              </div>
            </div>
          </div>
          
          <div className="bg-[#2B2B2B] p-6 rounded-2xl border border-white/5 shadow-lg flex flex-col justify-between max-h-[350px]">
            <div className="flex flex-col h-full">
              <h3 className="text-sm text-gray-400 font-medium mb-3">Claim History</h3>
              
              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                {combinedHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-gray-600">
                    <Clock className="w-8 h-8 mb-2 opacity-20" />
                    <p className="text-sm italic">No past activity found</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {combinedHistory.map((item, idx) => (
                      <div key={item.id || idx} className="bg-[#1A1A1A] p-3 rounded-xl border border-white/5 flex justify-between items-center group hover:border-[#0066FF]/30 transition-colors">
                        <div className="flex flex-col">
                          <span className={`text-[10px] uppercase font-bold tracking-wider mb-1 ${
                            item.type === 'bonus' ? 'text-[#0066FF]' :
                            item.status === 'approved' ? 'text-green-500' :
                            item.status === 'pending' ? 'text-yellow-500' : 'text-gray-500'
                          }`}>
                            {item.type === 'bonus' ? 'Loyalty Bonus' : item.status}
                          </span>
                          <span className="text-xs text-gray-400">
                            {new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                        <div className="text-right">
                          <p className={`font-bold ${item.type === 'bonus' || item.status === 'approved' ? 'text-white' : 'text-gray-600'}`}>
                            {item.type === 'bonus' ? `₹${item.return_amount}` : 
                             item.status === 'approved' ? `₹${item.final_payout}` : '—'}
                          </p>
                          <p className="text-[10px] text-gray-500">
                            {item.type === 'bonus' ? 'Returned' : 
                             item.status === 'approved' ? 'Payout' : 'Evaluated'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <p className="text-[10px] text-gray-500 mt-4 pt-4 border-t border-white/5">
              Automated claims are processed hourly.
            </p>
          </div>
        </div>

        {isPolicyActive && (
          <div className={`border rounded-2xl p-6 md:p-8 relative overflow-hidden shadow-2xl transition-all duration-500 ${
            (disruptionStage === 1 || activePolicy?.status === 'pending') ? 'bg-red-500/10 border-red-500/30 shadow-red-500/5' : 
            disruptionStage === 2 ? 'bg-green-500/10 border-green-500/30 shadow-green-500/5' :
            'bg-[#2B2B2B] border-white/5 shadow-black/50'
          }`}>
            
            {disruptionStage === 1 && <div className="absolute top-0 right-0 w-64 h-64 bg-red-500/10 rounded-full blur-[80px] pointer-events-none"></div>}
            {disruptionStage === 2 && <div className="absolute top-0 right-0 w-64 h-64 bg-green-500/10 rounded-full blur-[80px] pointer-events-none"></div>}
            
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
              <div className="flex gap-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
                  disruptionStage === 0 ? 'bg-gray-500/20' : 
                  disruptionStage === 1 ? 'bg-red-500/20' : 
                  'bg-green-500/20'
                }`}>
                  {disruptionStage === 0 && <ShieldCheck className="w-6 h-6 text-gray-400" />}
                  {disruptionStage === 1 && <CloudLightning className="w-6 h-6 text-red-500 animate-pulse" />}
                  {disruptionStage === 2 && <CheckCircle className="w-6 h-6 text-green-500" />}
                </div>
                <div>
                  {(disruptionStage === 0 && activePolicy?.status !== 'pending') && (
                    <>
                      <h3 className="text-xl font-bold text-gray-300">No Disruption Stage</h3>
                      <p className="text-gray-500 mt-2 max-w-lg leading-relaxed text-sm">
                        Your zone is currently clear. Tracking weather and event data automatically. 
                      </p>
                    </>
                  )}
                  {(disruptionStage === 1 || activePolicy?.status === 'pending') && (
                    <>
                      <h3 className="text-xl font-bold text-red-400 flex items-center gap-2">
                        <Radio className="w-5 h-5 animate-pulse" />
                        Disruption phase is now active: High Intensity Event
                      </h3>
                      <p className="text-gray-300 mt-2 max-w-lg leading-relaxed text-sm">
                        Your zone is under disruption stage. Your automated claim process has been initiated.
                      </p>
                    </>
                  )}
                  {disruptionStage === 2 && (
                    <>
                      <h3 className="text-xl font-bold text-green-400 flex items-center gap-2">
                        <CheckCircle className="w-5 h-5" />
                        Disruption finalised
                      </h3>
                      <p className="text-green-300/70 mt-2 max-w-lg leading-relaxed text-sm">
                        Your insurance will be claimed stage. The payout will be transferred to your linked UPI.
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Support & Help Desk */}
        <div className="bg-[#2B2B2B] p-8 rounded-2xl border border-white/5 shadow-xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h3 className="text-xl font-bold text-white mb-2">Support & Help Desk</h3>
              <p className="text-gray-400 text-sm max-w-md">
                Need assistance with your policy or have questions about a claim? Our support team is here to help you 24/7.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <a 
                href="mailto:support@infin.com" 
                className="flex items-center gap-3 bg-[#1A1A1A] px-4 py-3 rounded-xl border border-white/5 hover:border-[#0066FF]/50 transition-colors group"
              >
                <div className="w-10 h-10 rounded-full bg-[#0066FF]/10 flex items-center justify-center text-[#0066FF] group-hover:bg-[#0066FF] group-hover:text-white transition-all">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 uppercase font-bold">Email Us</p>
                  <p className="text-sm font-medium text-white">support@infin.com</p>
                </div>
              </a>
              <div className="flex items-center gap-3 bg-[#1A1A1A] px-4 py-3 rounded-xl border border-white/5 hover:border-[#0066FF]/50 transition-colors group">
                <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center text-green-500 group-hover:bg-green-500 group-hover:text-white transition-all">
                  <Phone className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 uppercase font-bold">Call Support</p>
                  <p className="text-sm font-medium text-white">1111 4444 3333</p>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Terms Modal */}
      {showTerms && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#222] w-full max-w-lg rounded-2xl border border-[#444] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center p-6 border-b border-[#333]">
              <h3 className="text-xl font-bold text-white">Coverage Terms & Conditions</h3>
              <button onClick={() => setShowTerms(false)} className="text-gray-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto">
              <p className="text-gray-300 mb-4 leading-relaxed text-sm">
                Before proceeding to calculate your personalized weekly premium, please review how InFin's parametric system works. Your policy strictly relies on automated data triggers from trusted meteorological and civic APIs.
              </p>

              <label className="flex items-start gap-3 cursor-pointer group">
                <div className="mt-1">
                  <input 
                    type="checkbox" 
                    checked={accepted}
                    onChange={(e) => setAccepted(e.target.checked)}
                    className="w-5 h-5 rounded border-[#444] text-[#0066FF] focus:ring-[#0066FF] focus:ring-offset-[#222] bg-[#1A1A1A] cursor-pointer"
                  />
                </div>
                <span className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors">
                  I have read and agree to the parametric insurance guidelines and automated evaluation process.
                </span>
              </label>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-[#333] flex gap-3 justify-end bg-[#1A1A1A]">
              <button 
                onClick={() => setShowTerms(false)}
                className="px-6 py-2 rounded-lg font-medium text-gray-400 hover:text-white transition-colors border border-transparent hover:border-[#444]"
              >
                Cancel
              </button>
              <button 
                onClick={handleAccept}
                disabled={!accepted}
                className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                  accepted 
                  ? 'bg-[#0066FF] hover:bg-[#0052cc] text-white shadow-lg shadow-blue-500/20' 
                  : 'bg-[#333] text-gray-500 cursor-not-allowed'
                }`}
              >
                {modalMode === 'subscribe' ? 'Accept & Continue' : 'Accept & Renew'}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
