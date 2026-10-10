import React from 'react';
import { Sparkles, CheckCircle2, ChevronRight, RotateCcw } from 'lucide-react';

interface DemoGuideBannerProps {
  currentStep: number;
  onNextStep: () => void;
  onReset: () => void;
  isAutoRunning: boolean;
}

const STEPS = [
  "1. Heat forecast crosses warning threshold (42.5°C)",
  "2. Registered hospitals in 1.5 km radius receive alert",
  "3. AI predicts heatwave patient surge (+88% admissions)",
  "4. Inventory engine calculates replenishment shortage",
  "5. Hospital staff acknowledges alert & confirms readiness",
  "6. Ambulance dispatch enters emergency transport request",
  "7. AI engine ranks best hospitals by ICU beds & distance",
  "8. Ambulance selects optimal hospital destination",
  "9. Hospital receives real-time alert & accepts patient",
  "10. Database updates live capacity & records audit logs"
];

export const DemoGuideBanner: React.FC<DemoGuideBannerProps> = ({
  currentStep,
  onNextStep,
  onReset,
  isAutoRunning
}) => {
  return (
    <div className="bg-gradient-to-r from-slate-100 via-teal-50/50 to-slate-100 border-b border-teal-200 py-2.5 px-4 text-slate-900 shadow-sm">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Left Info */}
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-xl bg-teal-100 border border-teal-300 flex items-center justify-center shrink-0 shadow-sm">
            <Sparkles className="w-4 h-4 text-teal-700 animate-spin" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-teal-800">
                Hackathon End-to-End Demo Scenario
              </span>
              <span className="text-[10px] bg-amber-100 text-amber-900 px-2.5 py-0.5 rounded-full border border-amber-300 font-bold font-mono">
                Step {currentStep + 1} of 10
              </span>
            </div>
            <p className="text-xs font-bold text-slate-900 mt-0.5">
              {STEPS[currentStep] || "Demo Completed Successfully!"}
            </p>
          </div>
        </div>

        {/* Center Progress Dots */}
        <div className="hidden lg:flex items-center space-x-1.5 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-inner">
          {STEPS.map((_, idx) => (
            <div
              key={idx}
              className={`h-2 rounded-full transition-all duration-300 ${
                idx === currentStep
                  ? 'w-7 bg-teal-600 shadow-sm'
                  : idx < currentStep
                  ? 'w-2 bg-emerald-500'
                  : 'w-2 bg-slate-200'
              }`}
              title={`Step ${idx + 1}`}
            />
          ))}
        </div>

        {/* Right Controls */}
        <div className="flex items-center space-x-2">
          {currentStep < 9 ? (
            <button
              onClick={onNextStep}
              disabled={isAutoRunning}
              className="inline-flex items-center px-3.5 py-1 rounded-lg text-xs font-extrabold bg-teal-600 hover:bg-teal-700 text-white transition shadow-sm cursor-pointer"
            >
              <span>Next Step</span>
              <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </button>
          ) : (
            <div className="flex items-center space-x-1.5 text-xs font-extrabold text-emerald-800 bg-emerald-50 border border-emerald-300 px-3 py-1 rounded-lg">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>10-Step Scenario Complete!</span>
            </div>
          )}

          <button
            onClick={onReset}
            className="px-2.5 py-1 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-200 border border-slate-300 transition flex items-center space-x-1 cursor-pointer bg-white"
          >
            <RotateCcw className="w-3 h-3 text-slate-500" />
            <span>Reset</span>
          </button>
        </div>
      </div>
    </div>
  );
};

