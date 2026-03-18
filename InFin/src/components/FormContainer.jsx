import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import IdentityForm from './forms/IdentityForm';
import WorkForm from './forms/WorkForm';
import PaymentForm from './forms/PaymentForm';
import ConsentForm from './forms/ConsentForm';
import { supabase } from '../supabase';

const FormContainer = ({ onGoToLogin, onSignupSuccess }) => {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    email: '',
    whatsapp: '',
    language: 'English',
    city: '',
    pinCode: '',
    platform: '',
    partnerId: '',
    upiId: '',
    consentEarnings: false,
    consentLocation: false,
    consentAutoPay: false,
    password: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const nextStep = () => setStep(prev => Math.min(prev + 1, 4));
  const prevStep = () => setStep(prev => Math.max(prev - 1, 1));

  const updateFormData = (data) => {
    setFormData(prev => ({ ...prev, ...data }));
  };

  const submitForm = async () => {
    setIsSubmitting(true);
    setSubmitError('');
    
    try {
      // Basic insert into workers table (adjust payload as per actual schema)
      const { error } = await supabase
        .from('workers')
        .insert([{
            phone_number: formData.whatsapp,
            platform: formData.platform,
            platform_partner_id: formData.partnerId,
            city: formData.city,
            pin_code: formData.pinCode,
            preferred_language: formData.language,
            upi_vpa: formData.upiId,
            consent_earnings: formData.consentEarnings,
            consent_gps: formData.consentLocation,
            consent_autopay: formData.consentAutoPay,
            email: formData.email,
            password: formData.password
        }]);

      if (error) {
         // Supabase returns useful error messages
         throw new Error(error.message);
      }
      
      setSubmitSuccess(true);
      // Wait a moment before moving UI state if needed
      
    } catch (err) {
      console.error("Submission error:", err);
      // Ensure we display error if API fails (like missing tables or keys)
      setSubmitError(err.message || "Failed to submit data. Please ensure the Supabase backend is configured correctly.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full md:w-1/2 p-6 md:p-10 flex flex-col items-center relative bg-[#222222] overflow-y-auto">
      <div className="w-full max-w-md my-auto py-8">
        
        {/* Step Indicator */}
        <div className="mb-8 flex justify-between items-center px-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                step >= i ? 'bg-[#0066FF] text-white' : 'bg-[#333] text-gray-500'
              }`}>
                {i}
              </div>
              {i < 4 && (
                 <div className={`w-12 h-1 mx-2 rounded ${
                   step > i ? 'bg-[#0066FF]' : 'bg-[#333]'
                 }`} />
              )}
            </div>
          ))}
        </div>

        {/* Form Area */}
        <div className="bg-[#2B2B2B] p-8 rounded-2xl border border-white/10 shadow-xl overflow-hidden min-h-[400px]">
          <AnimatePresence mode="wait">
             {step === 1 && (
               <IdentityForm 
                 key="step1" 
                 data={formData} 
                 updateData={updateFormData} 
                 onNext={nextStep} 
               />
             )}
             {step === 2 && (
               <WorkForm 
                 key="step2" 
                 data={formData} 
                 updateData={updateFormData} 
                 onNext={nextStep} 
                 onBack={prevStep} 
               />
             )}
             {step === 3 && (
               <PaymentForm 
                 key="step3" 
                 data={formData} 
                 updateData={updateFormData} 
                 onNext={nextStep} 
                 onBack={prevStep} 
               />
             )}
             {step === 4 && (
               <ConsentForm 
                 key="step4" 
                 data={formData} 
                 updateData={updateFormData} 
                 onSubmit={submitForm} 
                 onBack={prevStep}
                 isSubmitting={isSubmitting}
                 submitError={submitError}
                 submitSuccess={submitSuccess}
                 onSuccessRedirect={onSignupSuccess || onGoToLogin}
               />
             )}
          </AnimatePresence>
        </div>
        
        <div className="mt-6 text-center text-xs text-gray-500">
          <p>Your personal information is secure with InFin.</p>
        </div>

      </div>
    </div>
  );
};

export default FormContainer;
