import React, { useState } from 'react';
import { Shield, ChevronLeft, CreditCard, AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';

const PolicyPage = ({ user, onBack }) => {
  const [loading, setLoading] = useState(false);
  const [paid, setPaid] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [quoteData, setQuoteData] = useState(null);
  const [error, setError] = useState(null);

  React.useEffect(() => {
    const fetchQuote = async () => {
      try {
        const id = user?.id || user?.worker_id;
        console.log('[PolicyPage] Fetching quote for user_id:', id, '| full user obj:', user);
        if (!id) throw new Error("No user ID found in session. Please log in again.");

        const res = await fetch(`http://localhost:8000/api/v1/policy/quote?user_id=${id}`);
        const data = await res.json();
        console.log('[PolicyPage] API response:', res.status, data);
        if (!res.ok) throw new Error(data?.detail || `API error ${res.status}`);
        setQuoteData(data);
      } catch (err) {
        console.error('[PolicyPage] Quote fetch failed:', err);
        setError(`Engine 1 error: ${err.message}`);
        // Fallback using DB values already on the user object
        const fallbackDaily = user?.expected_daily_earnings || 800;
        const fallbackProb = user?.disruption_probability || 0.05;
        setQuoteData({
          expected_daily_earnings: fallbackDaily,
          disruption_probability: fallbackProb,
          weekly_premium: Math.round(fallbackDaily * fallbackProb * 0.70 * (1.15 / 0.65))
        });
      } finally {
        setQuoteLoading(false);
      }
    };
    fetchQuote();
  }, [user]);

  const expectedDaily = quoteData?.expected_daily_earnings || 0;
  const probability = quoteData?.disruption_probability || 0;
  const calculatedPremium = quoteData?.weekly_premium || 0;
  
  const [paymentError, setPaymentError] = useState(null);

  const handlePayment = async () => {
    setLoading(true);
    setPaymentError(null);
    try {
      const res = await fetch('http://localhost:8000/api/v1/policy/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_id: user?.id,
          policy_cost: calculatedPremium,
          expected_daily_earnings: expectedDaily,
          disruption_probability: probability,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || `Error ${res.status}`);
      // All good — show success screen
      setPaid(true);
    } catch (err) {
      console.error('[PolicyPage] Payment failed:', err);
      setPaymentError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (paid) {
    return (
      <div className="min-h-screen bg-[#1F1F1F] p-4 flex items-center justify-center">
        <div className="bg-[#2B2B2B] rounded-2xl p-10 max-w-md w-full text-center border border-green-500/20 shadow-2xl shadow-green-500/10">
          <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Payment Successful!</h2>
          <p className="text-gray-400 mb-8">
            Your weekly InFin policy is now active. You are fully protected against unexpected weather and zone disruptions.
          </p>
          <button 
            onClick={onBack}
            className="w-full bg-[#333] hover:bg-[#444] text-white font-semibold py-3 px-4 rounded-lg transition-colors"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1F1F1F] p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button 
            onClick={onBack}
            className="w-10 h-10 bg-[#2B2B2B] rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#333] transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">Your Weekly Policy</h1>
            <p className="text-gray-400 text-sm">Review your personalized coverage</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Premium Calculation Breakdown */}
          <div className="bg-[#2B2B2B] rounded-2xl p-6 border border-white/5 space-y-6">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-white mb-1">Weekly Premium</h3>
                <p className="text-xs text-gray-400">Calculated specifically for your zone and earning profile.</p>
              </div>
              <div className="bg-[#0066FF]/20 text-[#0066FF] px-3 py-1 rounded-full text-xs font-bold shrink-0">
                Data-Driven
              </div>
            </div>

            <div className="bg-[#1A1A1A] rounded-xl p-8 border border-[#333] relative flex flex-col items-center justify-center text-center">
              {quoteLoading && (
                <div className="absolute inset-0 bg-[#1A1A1A]/90 backdrop-blur-sm z-10 flex items-center justify-center rounded-xl">
                  <span className="text-[#0066FF] text-sm font-semibold animate-pulse flex items-center gap-2">
                    <Shield className="w-4 h-4" /> Generating your quote...
                  </span>
                </div>
              )}
              
              <span className="text-gray-400 text-sm font-medium mb-2 uppercase tracking-wider">Your Weekly Premium</span>
              <div className="flex items-baseline gap-1">
                <span className="text-5xl font-black text-[#0066FF] tracking-tight">₹{calculatedPremium || 0}</span>
                <span className="text-gray-500 font-medium">/wk</span>
              </div>
              <p className="text-xs text-gray-500 mt-4 max-w-[85%]">
                Coverage uniquely calculated for your typical zone routes and historical daily earnings.
              </p>
            </div>

            <button 
              onClick={handlePayment}
              disabled={loading || quoteLoading}
              className="w-full bg-[#0066FF] hover:bg-[#0052cc] text-white font-semibold py-4 rounded-xl transition-colors flex justify-center items-center gap-2 shadow-lg shadow-blue-500/20 disabled:opacity-75 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Activating your policy...
                </>
              ) : (
                <>
                  Pay ₹{calculatedPremium} via Stripe <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
            {paymentError && (
              <div className="mt-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400 text-center">
                {paymentError}
              </div>
            )}
            <p className="text-[10px] text-gray-500 text-center uppercase tracking-wider flex items-center justify-center gap-1 mt-2">
              <Shield className="w-3 h-3" /> Secure checkout
            </p>
          </div>

          {/* How Payouts Work */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider pl-2">How you are protected</h3>
            
            <div className="bg-[#2B2B2B] rounded-xl p-5 border border-white/5 flex gap-4">
              <div className="w-10 h-10 shrink-0 bg-[#0066FF]/10 text-[#0066FF] rounded-lg flex items-center justify-center font-black">
                1
              </div>
              <div>
                <h4 className="text-white font-semibold mb-1 text-sm">Disruption Validity (DVS)</h4>
                <p className="text-xs text-gray-400 leading-relaxed">
                  External APIs automatically confirm if heavy rain, extreme heat, or hazardous AQI occurred in your specific zone.
                </p>
              </div>
            </div>

            <div className="bg-[#2B2B2B] rounded-xl p-5 border border-white/5 flex gap-4">
              <div className="w-10 h-10 shrink-0 bg-[#0066FF]/10 text-[#0066FF] rounded-lg flex items-center justify-center font-black">
                2
              </div>
              <div>
                <h4 className="text-white font-semibold mb-1 text-sm">Zone Peer Comparison (ZPCS)</h4>
                <p className="text-xs text-gray-400 leading-relaxed">
                  We verify that at least 35% of other delivery partners in your area experienced a drop in order volume during the event window.
                </p>
              </div>
            </div>

            <div className="bg-[#2B2B2B] rounded-xl p-5 border border-white/5 flex gap-4">
              <div className="w-10 h-10 shrink-0 bg-[#0066FF]/10 text-[#0066FF] rounded-lg flex items-center justify-center font-black">
                3
              </div>
              <div>
                <h4 className="text-white font-semibold mb-1 text-sm">Instant Fair-Earn Payout</h4>
                <p className="text-xs text-gray-400 leading-relaxed">
                  If you earn less than 50% of your expected income because of the validated disruption, we bridge the gap automatically via UPI. No claim filing needed.
                </p>
              </div>
            </div>

            {/* Loyalty Banner */}
            <div className="mt-6 bg-gradient-to-r from-purple-900/40 to-[#0066FF]/20 rounded-xl p-5 border border-purple-500/20 text-center">
              <h4 className="text-purple-300 font-bold mb-1">24-Week Loyalty Bonus</h4>
              <p className="text-xs text-gray-300">
                Maintain 24 consecutive weekly payments with zero claims, and get up to 90% of your total premiums returned to you!
              </p>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
};

export default PolicyPage;
