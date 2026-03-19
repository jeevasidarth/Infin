import React, { useState, useEffect } from 'react';
import { Shield, ChevronRight, X, ExternalLink, ShieldCheck, Clock, AlertCircle, CloudLightning, Radio, CheckCircle, MapPin } from 'lucide-react';

const Dashboard = ({ user, onLogout, onGoToPolicy }) => {
  const [showTerms, setShowTerms] = useState(false);
  const [showFullTerms, setShowFullTerms] = useState(false);
  const [accepted, setAccepted] = useState(false);

  // Mocking insurance status & weekly reset logic
  const [isPolicyActive, setIsPolicyActive] = useState(user?.policyStatus === 'active' || false);
  
  // 0 = No Disruption, 1 = Active Disruption, 2 = Finalised
  const [disruptionStage, setDisruptionStage] = useState(0); 
  
  // Logic for a weekly reset: mock 5 days remaining out of 7 for demonstration if active
  const daysUntilReset = user?.daysUntilReset || 5; 

  const handleAccept = () => {
    setShowTerms(false);
    onGoToPolicy();
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

      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Welcome Card */}
        <div className="bg-[#2B2B2B] rounded-2xl p-8 border border-white/5 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#0066FF]/10 rounded-full blur-[80px] pointer-events-none"></div>
          
          <h2 className="text-3xl font-bold text-white mb-2">Hello, {user?.platform || 'Worker'} Partner!</h2>
          <p className="text-gray-400 mb-8 max-w-md">
            Protect your daily earnings against unexpected weather and zone disruptions. No claims to file, just peace of mind.
          </p>

          {!isPolicyActive && (
            <button
              onClick={() => setShowTerms(true)}
              className="bg-[#0066FF] hover:bg-[#0052cc] text-white font-semibold flex items-center gap-2 py-4 px-8 rounded-xl transition-all hover:scale-[1.02] shadow-lg shadow-blue-500/20 text-lg"
            >
              <Shield className="w-5 h-5" /> Get Insurance Now <ChevronRight className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Insurance Status Card with Weekly Reset */}
          <div className="bg-[#2B2B2B] p-6 rounded-2xl border border-white/5 shadow-lg flex flex-col justify-between relative overflow-hidden">
            {isPolicyActive && (
              <div className="absolute top-0 left-0 w-full h-1 bg-green-500/50"></div>
            )}
            
            <div>
              <h3 className="text-sm text-gray-400 font-medium mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#0066FF]" /> Insurance Status
              </h3>
              <div className="flex items-center gap-3 mb-1">
                <span className="relative flex h-3 w-3">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isPolicyActive ? 'bg-green-400' : 'bg-red-400'}`}></span>
                  <span className={`relative inline-flex rounded-full h-3 w-3 ${isPolicyActive ? 'bg-green-500' : 'bg-red-500'}`}></span>
                </span>
                <p className={`text-2xl font-bold ${isPolicyActive ? 'text-green-400' : 'text-red-400'}`}>
                  {isPolicyActive ? 'Active' : 'Inactive'}
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

          <div className="bg-[#2B2B2B] p-6 rounded-2xl border border-white/5 shadow-lg flex flex-col justify-between">
            <div>
              <h3 className="text-sm text-gray-400 font-medium mb-1 flex items-center gap-2">
                Protected Income 
                <span className="text-xs px-2 py-0.5 rounded bg-[#1A1A1A] text-gray-400 border border-white/10">Cap</span>
              </h3>
              <p className={`text-3xl font-bold mt-2 ${isPolicyActive ? 'text-white' : 'text-gray-500'}`}>
                {isPolicyActive ? '₹2,400' : '₹0'}
              </p>
            </div>
            <p className="text-xs text-gray-500 mt-4 pt-4 border-t border-white/5">
              Weekly protection floor based on earnings.
            </p>
          </div>

          <div className="bg-[#2B2B2B] p-6 rounded-2xl border border-white/5 shadow-lg flex flex-col justify-between">
            <div>
              <h3 className="text-sm text-gray-400 font-medium mb-1">Recent Claims</h3>
              <div className="mt-3 flex items-center gap-2">
                <AlertCircle className="text-gray-500 w-5 h-5" />
                <p className="text-lg font-medium text-gray-500">
                  {isPolicyActive && disruptionStage === 1 ? '1 Processing' : 
                   isPolicyActive && disruptionStage === 2 ? '1 Finalised' : 
                   'No active claims'}
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-4 pt-4 border-t border-white/5">
              Automated claims will appear here.
            </p>
          </div>
        </div>

        {/* Active Disruption Tracker - Always visible when insured, to show current stage */}
        {isPolicyActive && (
          <div className={`border rounded-2xl p-6 md:p-8 relative overflow-hidden shadow-2xl transition-all duration-500 ${
            disruptionStage === 0 ? 'bg-[#2B2B2B] border-white/5 shadow-black/50' : 
            disruptionStage === 1 ? 'bg-red-500/10 border-red-500/30 shadow-red-500/5' : 
            'bg-green-500/10 border-green-500/30 shadow-green-500/5'
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
                  {disruptionStage === 0 && (
                    <>
                      <h3 className="text-xl font-bold text-gray-300">No Disruption Stage</h3>
                      <p className="text-gray-500 mt-2 max-w-lg leading-relaxed text-sm">
                        Your zone is currently clear. Tracking weather and event data automatically. 
                      </p>
                    </>
                  )}
                  {disruptionStage === 1 && (
                    <>
                      <h3 className="text-xl font-bold text-red-400 flex items-center gap-2">
                        <Radio className="w-5 h-5 animate-pulse" />
                        Disruption phase is now active: Heavy Rain Detected
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
                Accept & Continue
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
