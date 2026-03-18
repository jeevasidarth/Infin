import { motion } from 'framer-motion';

const PaymentForm = ({ data, updateData, onNext, onBack }) => {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col h-full"
    >
      <h2 className="text-2xl font-semibold mb-2">Payment Setup</h2>
      <p className="text-gray-400 text-sm mb-6">Where should we send your payouts? We'll also use this for your weekly auto-pay.</p>

      <div className="space-y-6 flex-1 mt-2">
        <div>
           <label className="block text-xs text-gray-400 mb-2 ml-1 uppercase tracking-wide">
             UPI ID (VPA)
           </label>
           <div className="relative">
             <input
               type="text"
               placeholder="yournumber@upi"
               className="w-full bg-[#1F1F1F] border border-[#444] rounded-lg pl-4 pr-12 py-3 text-white focus:outline-none focus:border-[#0066FF] transition-colors focus:ring-1 focus:ring-[#0066FF]"
               value={data.upiId}
               onChange={e => updateData({ upiId: e.target.value })}
             />
             <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[#0066FF]">
               <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
             </div>
           </div>
        </div>

        <div className="bg-[#1F1F1F] rounded-lg p-4 border border-[#444] flex items-start gap-3">
          <div className="mt-0.5 text-[#0066FF]">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
          </div>
          <div>
            <h4 className="text-sm font-medium text-white mb-1">Why do we need this?</h4>
            <ul className="space-y-1 text-xs text-gray-400">
              <li className="flex items-center gap-2"><span className="w-1 h-1 bg-gray-500 rounded-full"></span> <strong>Instant Payouts:</strong> Claims are credited to your account within 3 minutes of approval.</li>
              <li className="flex items-center gap-2"><span className="w-1 h-1 bg-gray-500 rounded-full"></span> <strong>AutoPay:</strong> Your weekly personalised premium will be automatically deducted so your coverage never lapses.</li>
            </ul>
          </div>
        </div>

      </div>

      <div className="mt-8 flex gap-3">
        <button
          onClick={onBack}
          className="w-1/3 bg-transparent border border-[#555] hover:bg-[#333] text-white font-medium py-3 px-4 rounded-lg transition-colors"
        >
          Back
        </button>
        <button
          onClick={onNext}
          className="w-2/3 bg-[#0066FF] hover:bg-[#0052cc] text-white font-semibold py-3 px-4 rounded-lg transition-colors"
        >
          Continue
        </button>
      </div>
    </motion.div>
  );
};

export default PaymentForm;
