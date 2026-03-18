import { motion } from 'framer-motion';

const WorkForm = ({ data, updateData, onNext, onBack }) => {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col h-full"
    >
      <h2 className="text-2xl font-semibold mb-2">Work Details</h2>
      <p className="text-gray-400 text-sm mb-6">Select your primary delivery platform to calculate your expected earnings.</p>

      <div className="space-y-5 flex-1">
        
        <div>
           <label className="block text-xs text-gray-400 mb-2 ml-1 uppercase tracking-wide">
             Delivery Platform
           </label>
           <div className="grid grid-cols-2 gap-3">
             <button
               className={`py-3 rounded-lg border flex justify-center items-center font-medium transition-all ${
                 data.platform === 'Zomato' 
                 ? 'bg-[#E23744]/20 border-[#E23744] text-[#E23744]' 
                 : 'bg-[#1F1F1F] border-[#444] text-gray-300 hover:border-gray-500'
               }`}
               onClick={() => updateData({ platform: 'Zomato' })}
             >
               Zomato
             </button>
             <button
               className={`py-3 rounded-lg border flex justify-center items-center font-medium transition-all ${
                 data.platform === 'Swiggy' 
                 ? 'bg-[#FC8019]/20 border-[#FC8019] text-[#FC8019]' 
                 : 'bg-[#1F1F1F] border-[#444] text-gray-300 hover:border-gray-500'
               }`}
               onClick={() => updateData({ platform: 'Swiggy' })}
             >
               Swiggy
             </button>
           </div>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1 ml-1 uppercase tracking-wide mt-4">
            Platform Partner ID
          </label>
          <input
            type="text"
            placeholder="e.g. ZOM-84291"
            className="w-full bg-[#1F1F1F] border border-[#444] rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#0066FF] transition-colors focus:ring-1 focus:ring-[#0066FF]"
            value={data.partnerId}
            onChange={e => updateData({ partnerId: e.target.value })}
          />
          <p className="text-xs text-gray-500 mt-2 ml-1">
            Required to verify your expected daily earnings and process seamless payouts.
          </p>
        </div>

        <div className="mt-4 pt-4 border-t border-[#444]">
           <button className="w-full bg-[#1F1F1F] border border-[#444] hover:bg-[#333] py-3 rounded-lg text-sm text-gray-300 flex items-center justify-center gap-2 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              Quick Login via Partner OAuth
           </button>
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

export default WorkForm;
