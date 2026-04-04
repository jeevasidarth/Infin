import { ShieldCheck, CloudRain, Sun, Activity } from 'lucide-react';

const InFinPanel = () => {
  return (
    <div className="w-full md:w-1/2 bg-gradient-to-br from-[#0066FF] to-[#0052cc] p-10 flex flex-col justify-between text-white relative overflow-y-auto overflow-x-hidden min-h-full">
      {/* Background Decor */}
      <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-white opacity-5 rounded-full blur-[80px] pointer-events-none"></div>
      
      <div>
        <div className="flex items-center gap-3 mb-16">
          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-lg">
            <ShieldCheck className="w-7 h-7 text-[#0066FF]" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">InFin</h1>
        </div>

        <div className="space-y-6 max-w-md">
          <h2 className="text-4xl md:text-5xl font-bold leading-tight">
            Worked today.<br />
            Protected always.
          </h2>
          <p className="text-lg text-blue-100 font-medium">
            AI-powered parametric income insurance for platform delivery workers.
          </p>
        </div>

        <div className="mt-12 flex flex-wrap gap-3">
          <span className="px-4 py-2 bg-white/10 backdrop-blur-md border border-white/20 rounded-full text-sm font-medium">
            Zero Paperwork
          </span>
          <span className="px-4 py-2 bg-white/10 backdrop-blur-md border border-white/20 rounded-full text-sm font-medium">
            Automated Payouts
          </span>
        </div>
      </div>

      <div className="mt-16 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-blue-100 uppercase tracking-wider mb-4">
          Coverage Triggers
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="flex flex-col items-center gap-2 text-center">
            <CloudRain className="w-6 h-6 text-blue-200" />
            <span className="text-xs font-medium">Heavy Rain</span>
          </div>
          <div className="flex flex-col items-center gap-2 text-center">
            <Sun className="w-6 h-6 text-blue-200" />
            <span className="text-xs font-medium">Extreme Heat</span>
          </div>
          <div className="flex flex-col items-center gap-2 text-center">
            <Activity className="w-6 h-6 text-blue-200" />
            <span className="text-xs font-medium">Hazardous AQI</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InFinPanel;
