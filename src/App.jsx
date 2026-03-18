import { useState } from 'react';
import InFinPanel from './components/InFinPanel';
import FormContainer from './components/FormContainer';

function App() {
  return (
    <div className="min-h-screen bg-[#1F1F1F] flex items-center justify-center p-4">
      {/* Main Container - Split Screen */}
      <div className="w-full max-w-[1200px] h-[800px] max-h-[90vh] bg-[#2B2B2B] rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row border border-white/5">
        <InFinPanel />
        <FormContainer />
      </div>
    </div>
  );
}

export default App;
