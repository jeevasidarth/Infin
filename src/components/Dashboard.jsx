import React, { useState, useEffect } from 'react';
import { Shield, ChevronRight, X, ExternalLink, ShieldCheck, Clock, AlertCircle, CloudLightning, Radio, CheckCircle, MapPin, Mail, Phone } from 'lucide-react';
import { supabase } from '../supabase';

const Dashboard = ({ user, onLogout, onGoToPolicy }) => {
  const [showTerms, setShowTerms] = useState(false);
  const [showFullTerms, setShowFullTerms] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [modalMode, setModalMode] = useState('subscribe');

  const [activePolicy, setActivePolicy] = useState(null);
  const [allClaims, setAllClaims] = useState([]);
  const [loadingPolicy, setLoadingPolicy] = useState(true);
  const [renewing, setRenewing] = useState(false);
  const [renewalFeedback, setRenewalFeedback] = useState(null);
  const [disruptionStage, setDisruptionStage] = useState(0); 

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

        // Fetch All Claims
        const pols = await supabase.from('policies').select('id').eq('worker_id', id);
        if (pols.data && pols.data.length > 0) {
           const p_ids = pols.data.map(p => p.id);
           const {data: claimsData, error: claimsErr} = await supabase
             .from('claims')
             .select('*')
             .in('policy_id', p_ids)
             .order('created_at', {ascending: false});
             
           if (claimsData && !claimsErr) {
             setAllClaims(claimsData);
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
    try {
      const res = await fetch('http://localhost:8000/api/v1/policy/renew', {
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
      {allClaims.length > 0 && (
         <div className="max-w-4xl mx-auto mb-6">
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
           {allClaims[0].status === 'rejected' && (
             <div className="bg-gray-700/50 border border-gray-600 rounded-xl p-4 flex items-start gap-4">
               <Shield className="text-gray-400 w-6 h-6 flex-shrink-0 mt-1"/>
               <div>
                 <h3 className="text-gray-300 font-bold mb-1 border-b border-gray-600 pb-1">Claim Evaluated: No Payout Required</h3>
                 <p className="text-gray-400 text-sm">A recent weather disruption was evaluated, but your completed deliveries indicate your earnings did not drop below the critical 50% threshold. Excellent job pushing through the bad weather!</p>
               </div>
             </div>
           )}
         </div>
      )}

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
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 bg-[#1A1A1A] rounded-xl p-4 border border-[#333]">
                  <p className="text-sm text-gray-400 mb-1">Current Streak</p>
                  <p className="text-2xl font-bold text-[#0066FF]">{activePolicy.cumulative_weeks_count} Weeks</p>
                </div>
                <div className="flex-1 bg-[#1A1A1A] rounded-xl p-4 border border-[#333]">
                  <p className="text-sm text-gray-400 mb-1">Total Saved</p>
                  <p className="text-2xl font-bold text-green-400">₹{activePolicy.cumulative_amount_collected}</p>
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
                  {renewing ? "Processing..." : canRenew ? `Continue Policy (Pay ₹${activePolicy.policy_cost} ->)` : "Fully Covered for Next Week"}
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
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
                {allClaims.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-gray-600">
                    <Clock className="w-8 h-8 mb-2 opacity-20" />
                    <p className="text-sm italic">No past claims found</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {allClaims.map((claim) => (
                      <div key={claim.id} className="bg-[#1A1A1A] p-3 rounded-xl border border-white/5 flex justify-between items-center group hover:border-[#0066FF]/30 transition-colors">
                        <div className="flex flex-col">
                          <span className={`text-[10px] uppercase font-bold tracking-wider mb-1 ${
                            claim.status === 'approved' ? 'text-green-500' :
                            claim.status === 'pending' ? 'text-yellow-500' : 'text-gray-500'
                          }`}>
                            {claim.status}
                          </span>
                          <span className="text-xs text-gray-400">
                            {new Date(claim.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                        <div className="text-right">
                          <p className={`font-bold ${claim.status === 'approved' ? 'text-white' : 'text-gray-600'}`}>
                            {claim.status === 'approved' ? `₹${claim.final_payout}` : '—'}
                          </p>
                          <p className="text-[10px] text-gray-500">
                            {claim.status === 'approved' ? 'Payout' : 'Evaluated'}
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

        {/* Developer Testing Toggles (Not visible in prod) */}
        <div className="mt-12 p-5 bg-[#1A1A1A] rounded-xl border border-dashed border-[#444] flex flex-wrap gap-4 items-center">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center">Developer Simulation Tools:</span>
          <button 
            onClick={() => setIsPolicyActive(!isPolicyActive)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors font-medium ${isPolicyActive ? 'border-green-500/50 text-green-500 bg-green-500/10' : 'border-[#444] text-gray-400 hover:text-white'}`}
          >
            {isPolicyActive ? 'Turn Off Active Policy' : 'Simulate Active Policy'}
          </button>
          
          <div className="flex gap-2">
            <button 
              onClick={() => setDisruptionStage(0)}
              disabled={!isPolicyActive}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors font-medium ${disruptionStage === 0 ? 'border-gray-500/50 text-gray-400 bg-gray-500/10' : 'border-[#444] text-gray-500 disabled:opacity-30'} hover:text-white disabled:hover:text-gray-400`}
            >
              No Disruption
            </button>
            <button 
              onClick={() => setDisruptionStage(1)}
              disabled={!isPolicyActive}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors font-medium ${disruptionStage === 1 ? 'border-red-500/50 text-red-500 bg-red-500/10' : 'border-[#444] text-gray-500 disabled:opacity-30'} hover:text-white disabled:hover:text-gray-400`}
            >
              Trigger Disruption
            </button>
            <button 
              onClick={() => setDisruptionStage(2)}
              disabled={!isPolicyActive}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors font-medium ${disruptionStage === 2 ? 'border-green-500/50 text-green-500 bg-green-500/10' : 'border-[#444] text-gray-500 disabled:opacity-30'} hover:text-white disabled:hover:text-gray-400`}
            >
              Finalise Claim
            </button>
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

              {/* Expandable full terms inside same popup */}
              <div className="mb-6">
                <button 
                  onClick={() => setShowFullTerms(!showFullTerms)}
                  className="text-[#0066FF] font-medium text-sm flex items-center gap-1 hover:underline outline-none"
                >
                  <ExternalLink className="w-4 h-4" /> 
                  {showFullTerms ? 'Hide Full Legal Terms' : 'Read Full Terms & Conditions'}
                </button>
                
                {showFullTerms && (
                  <div className="mt-4 p-4 bg-[#1A1A1A] rounded-lg border border-[#333] text-xs text-gray-400 space-y-3 h-48 overflow-y-auto custom-scrollbar">
                    <p><strong>1. Policy Activation:</strong> Coverage begins immediately upon successful payment of your weekly premium. The 6-hour refractory period applies for spontaneous disruption events (e.g. riots, unplanned barricading).</p>
                    <p><strong>2. Payout Gates:</strong> Claim payouts are strictly evaluated using the 3-Gate Check (DVS, ZPCS, AEC). Traditional damage claims are not entertained. Valid disbursements happen automatically via UPI.</p>
                    <p><strong>3. Anti-Gaming Clause:</strong> Policies bought *after* an official public disruption alert (e.g. IMD Orange/Red alert, strike announcement) are excluded from coverage for that specific event.</p>
                    <p><strong>4. Dispute Resolution:</strong> All external API data snapshots used for gate validity are final. Manual audit requests are subject to internal operational capacities.</p>
                    <p><strong>5. Loyalty Bonus:</strong> A minimum of 24 concurrent weekly payments without any claims grants a partial return of premiums. A single missed week resets your standing.</p>
                  </div>
                )}
              </div>

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
                  I have read and agree to the parametric insurance guidelines, automatic gate evaluation process, and the 6-hour spontaneous event refractory rule.
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
