import { motion } from 'framer-motion';

const IdentityForm = ({ data, updateData, onNext }) => {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col h-full"
    >
      <h2 className="text-2xl font-semibold mb-2">Identity & Contact</h2>
      <p className="text-gray-400 text-sm mb-6">Let's get you set up. Enter your primary contact details.</p>

      <div className="space-y-4 flex-1">
        <div>
          <label className="block text-xs text-gray-400 mb-1 ml-1 uppercase tracking-wide">
            Email Address
          </label>
          <input
            type="email"
            placeholder="worker@example.com"
            className="w-full bg-[#1F1F1F] border border-[#444] rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#0066FF] transition-colors"
            value={data.email}
            onChange={e => updateData({ email: e.target.value })}
          />
        </div>

        <div>
           <label className="block text-xs text-gray-400 mb-1 ml-1 uppercase tracking-wide">
             WhatsApp Number
           </label>
           <div className="flex">
             <span className="bg-[#1F1F1F] border border-[#444] border-r-0 rounded-l-lg px-4 py-3 text-gray-400">
               +91
             </span>
             <input
               type="tel"
               placeholder="99999 99999"
               className="w-full bg-[#1F1F1F] border border-[#444] rounded-r-lg px-4 py-3 text-white focus:outline-none focus:border-[#0066FF] transition-colors"
               value={data.whatsapp}
               onChange={e => updateData({ whatsapp: e.target.value })}
             />
           </div>
        </div>

        <div>
           <label className="block text-xs text-gray-400 mb-1 ml-1 uppercase tracking-wide">
             Preferred Language
           </label>
           <select
             className="w-full bg-[#1F1F1F] border border-[#444] rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#0066FF] transition-colors appearance-none"
             value={data.language}
             onChange={e => updateData({ language: e.target.value })}
           >
             <option value="Hindi">Hindi</option>
             <option value="Tamil">Tamil</option>
             <option value="Telugu">Telugu</option>
             <option value="Kannada">Kannada</option>
             <option value="Marathi">Marathi</option>
             <option value="English">English</option>
           </select>
        </div>
      </div>

      <button
        onClick={onNext}
        className="mt-8 w-full bg-[#0066FF] hover:bg-[#0052cc] text-white font-semibold py-3 px-4 rounded-lg transition-colors"
      >
        Continue
      </button>
    </motion.div>
  );
};

export default IdentityForm;
