import React, { useState } from 'react';
import { Shield, ChevronLeft, CreditCard, AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { API_BASE_URL } from '../config';

const PolicyPage = ({ user, onBack, triggerRazorpay }) => {
  const [loading, setLoading] = useState(false);
  const [paid, setPaid] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [quoteData, setQuoteData] = useState(null);
  const [error, setError] = useState(null);

  React.useEffect(() => {
    const fetchQuote = async () => {
      try {
        const id = user?.id || user?.worker_id;
        if (!id) throw new Error("No user ID found in session.");

        const res = await fetch(`${API_BASE_URL}/api/v1/policy/quote?user_id=${id}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.detail || `API error ${res.status}`);
        setQuoteData(data);
      } catch (err) {
        console.error('[PolicyPage] Quote fetch failed:', err);
        setError(`Engine 1 error: ${err.message}`);
        // Fallback
        setQuoteData({
          expected_daily_earnings: user?.expected_daily_earnings || 800,
          disruption_probability: user?.disruption_probability || 0.05,
          weekly_premium: Math.round((user?.expected_daily_earnings || 800) * (user?.disruption_probability || 0.05) * 0.70 * (1.15 / 0.65))
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

    // Call Razorpay checkout
    await triggerRazorpay(calculatedPremium, async (response) => {
        try {
          const res = await fetch(`${API_BASE_URL}/api/v1/policy/subscribe`, {
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
          setPaid(true);
        } catch (err) {
          console.error('[PolicyPage] Payment failed:', err);
          setPaymentError(err.message);
        } finally {
          setLoading(false);
        }
    });

    setTimeout(() => setLoading(false), 2000); // Reset if cancelled
  };

  if (paid) {
    return (
      <div className="min-h-screen bg-[#1F1F1F] p-4 flex items-center justify-center">
        <div className="bg-[#2B2B2B] rounded-2xl p-10 max-w-md w-full text-center border border-green-500/20 shadow-2xl shadow-green-500/10">
          <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Payment Successful!</h2>
          <p className="text-gray-400 mb-8">Your weekly InFin policy is now active. You are fully protected.</p>
          <button onClick={onBack} className="w-full bg-[#333] hover:bg-[#444] text-white font-semibold py-3 px-4 rounded-lg transition-colors">Return to Dashboard</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1F1F1F] p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={onBack} className="w-10 h-10 bg-[#2B2B2B] rounded-full flex items-center justify-center text-gray-400 hover:text-white transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">Your Weekly Policy</h1>
            <p className="text-gray-400 text-sm">Review your personalized coverage</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-[#2B2B2B] rounded-2xl p-6 border border-white/5 space-y-6">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-white mb-1">Weekly Premium</h3>
                <p className="text-xs text-gray-400">Calculated specifically for your zone and profile.</p>
              </div>
              <div className="bg-[#0066FF]/20 text-[#0066FF] px-3 py-1 rounded-full text-xs font-bold leading-none py-1.5 shrink-0">Data-Driven</div>
            </div>

            <div className="bg-[#1A1A1A] rounded-xl p-8 border border-[#333] relative flex flex-col items-center justify-center text-center">
              {quoteLoading && (
                <div className="absolute inset-0 bg-[#1A1A1A]/90 backdrop-blur-sm z-10 flex items-center justify-center rounded-xl">
                  <span className="text-[#0066FF] text-sm font-semibold animate-pulse">Generating your quote...</span>
                </div>
              )}
              <span className="text-gray-400 text-sm font-medium mb-2 uppercase tracking-wider">Your Weekly Premium</span>
              <div className="flex items-baseline gap-1">
                <span className="text-5xl font-black text-[#0066FF]">₹{calculatedPremium}</span>
                <span className="text-gray-500 font-medium">/wk</span>
              </div>
            </div>

            <button 
              onClick={handlePayment}
              disabled={loading || quoteLoading}
              className="w-full bg-[#0066FF] hover:bg-[#0052cc] text-white font-semibold py-4 rounded-xl transition-colors flex justify-center items-center gap-2 shadow-lg shadow-blue-500/20 disabled:opacity-75 disabled:cursor-not-allowed"
            >
              {loading ? "Activating..." : `Pay ₹${calculatedPremium} via Razorpay`} <ArrowRight className="w-5 h-5" />
            </button>
            {paymentError && <div className="mt-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-500 text-center">{paymentError}</div>}
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider pl-2">How you are protected</h3>
            {[
              { id: 1, title: "Disruption Validity (DVS)", desc: "External APIs automatically confirm if heavy rain or hazardous AQI occurred in your zone." },
              { id: 2, title: "Zone Peer Comparison (ZPCS)", desc: "We verify if at least 35% of other delivery partners experienced a drop in order volume." },
              { id: 3, title: "Instant Fair-Earn Payout", desc: "If you earn less than 50% of expected income, we bridge the gap via UPI." }
            ].map(step => (
                <div key={step.id} className="bg-[#2B2B2B] rounded-xl p-5 border border-white/5 flex gap-4">
                    <div className="w-10 h-10 shrink-0 bg-[#0066FF]/10 text-[#0066FF] rounded-lg flex items-center justify-center font-black">{step.id}</div>
                    <div><h4 className="text-white font-semibold mb-1 text-sm">{step.title}</h4><p className="text-xs text-gray-400 leading-relaxed">{step.desc}</p></div>
                </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PolicyPage;
