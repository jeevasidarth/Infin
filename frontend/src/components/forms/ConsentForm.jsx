import { motion } from 'framer-motion';

const ConsentForm = ({ data, updateData, onSubmit, onBack, isSubmitting, submitError, submitSuccess, onSuccessRedirect }) => {

  const canSubmit = data.consentEarnings && data.consentLocation && data.consentAutoPay && !isSubmitting;

  if (submitSuccess) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center justify-center h-full text-center py-10"
      >
        <div className="w-16 h-16 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </div>
        <h2 className="text-2xl font-bold mb-2">Setup Complete!</h2>
        <p className="text-gray-400 mb-8 max-w-sm">
          Your InFin profile is ready. You are now protected against sudden income disruptions.
        </p>
        <button
          onClick={onSuccessRedirect ? onSuccessRedirect : () => window.location.reload()}
          className="bg-[#0066FF] hover:bg-[#0052cc] text-white font-semibold py-3 px-8 rounded-lg transition-colors"
        >
          Go to Login
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col h-full"
    >
      <h2 className="text-2xl font-semibold mb-2">Final Step: Approvals</h2>
      <p className="text-gray-400 text-sm mb-6">We need your permission to make InFin work seamlessly for you.</p>

      {submitError && (
        <div className="mb-4 bg-red-500/10 border border-red-500/50 text-red-500 text-sm px-4 py-3 rounded-lg flex items-start gap-3">
           <svg xmlns="http://www.w3.org/2000/svg" className="shrink-0 mt-0.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
           <span>{submitError}</span>
        </div>
      )}

      <div className="space-y-4 flex-1 mt-2">
        
        {/* Consent earnings */}
        <label className="flex items-start gap-4 p-4 rounded-lg border border-[#444] bg-[#1F1F1F] cursor-pointer hover:border-gray-500 transition-colors">
          <div className="mt-1">
            <input 
              type="checkbox" 
              className="w-5 h-5 rounded border-gray-400 text-[#0066FF] focus:ring-[#0066FF] focus:ring-offset-[#1F1F1F] bg-[#2B2B2B]"
              checked={data.consentEarnings}
              onChange={e => updateData({ consentEarnings: e.target.checked })}
            />
          </div>
          <div>
            <h4 className="text-sm font-medium text-white">Earnings Data Access</h4>
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">
              I authorize InFin to securely access my 4-week rolling earnings history from my platform to calculate my personalized premium and verify payout eligibility.
            </p>
          </div>
        </label>

        {/* Consent location */}
         <label className="flex items-start gap-4 p-4 rounded-lg border border-[#444] bg-[#1F1F1F] cursor-pointer hover:border-gray-500 transition-colors">
          <div className="mt-1">
            <input 
              type="checkbox" 
              className="w-5 h-5 rounded border-gray-400 text-[#0066FF] focus:ring-[#0066FF] focus:ring-offset-[#1F1F1F] bg-[#2B2B2B]"
              checked={data.consentLocation}
              onChange={e => updateData({ consentLocation: e.target.checked })}
            />
          </div>
          <div>
            <h4 className="text-sm font-medium text-white">Location Services (GPS)</h4>
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">
              I allow InFin to verify my presence in accurate disruption zones to ensure fraud-resistant, instant event validation.
            </p>
          </div>
        </label>

        {/* Consent AutoPay */}
         <label className="flex items-start gap-4 p-4 rounded-lg border border-[#444] bg-[#1F1F1F] cursor-pointer hover:border-gray-500 transition-colors">
          <div className="mt-1">
            <input 
              type="checkbox" 
              className="w-5 h-5 rounded border-gray-400 text-[#0066FF] focus:ring-[#0066FF] focus:ring-offset-[#1F1F1F] bg-[#2B2B2B]"
              checked={data.consentAutoPay}
              onChange={e => updateData({ consentAutoPay: e.target.checked })}
            />
          </div>
          <div>
            <h4 className="text-sm font-medium text-white">UPI AutoPay Mandate</h4>
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">
              I approve setting up a weekly UPI auto-debit for my premium on the provided VPA. I can cancel anytime after 4 weeks.
            </p>
          </div>
        </label>

      </div>

      <div className="mt-8 flex gap-3">
        <button
          onClick={onBack}
          disabled={isSubmitting}
          className="w-1/3 bg-transparent border border-[#555] hover:bg-[#333] disabled:opacity-50 text-white font-medium py-3 px-4 rounded-lg transition-colors"
        >
          Back
        </button>
        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          className={`w-2/3 font-semibold py-3 px-4 rounded-lg transition-all flex items-center justify-center gap-2 ${
            canSubmit 
            ? 'bg-[#0066FF] hover:bg-[#0052cc] text-white' 
            : 'bg-[#333] text-gray-500 cursor-not-allowed'
          }`}
        >
          {isSubmitting ? (
             <>
               <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                 <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                 <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
               </svg>
               Submitting...
             </>
          ) : (
            'Complete Setup'
          )}
        </button>
      </div>
    </motion.div>
  );
};

export default ConsentForm;
