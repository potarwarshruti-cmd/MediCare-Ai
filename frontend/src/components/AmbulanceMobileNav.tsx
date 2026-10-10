import React from 'react';
import { Ambulance, Navigation, Compass } from 'lucide-react';

interface AmbulanceMobileNavProps {
  activeScreen: string;
  setActiveScreen: (screen: string) => void;
  hasActiveRequest: boolean;
}

export const AmbulanceMobileNav: React.FC<AmbulanceMobileNavProps> = ({
  activeScreen,
  setActiveScreen,
  hasActiveRequest,
}) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-xl border-t border-slate-200 shadow-lg py-1 px-4 sm:hidden">
      <div className="max-w-md mx-auto grid grid-cols-3 gap-1">
        <button
          onClick={() => setActiveScreen('ambulance_entry')}
          className={`py-2 px-1 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer ${
            activeScreen === 'ambulance_entry'
              ? 'bg-teal-50 text-teal-800 font-extrabold'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Ambulance className={`w-5 h-5 mb-0.5 ${activeScreen === 'ambulance_entry' ? 'text-teal-600' : 'text-slate-400'}`} />
          <span className="text-[10px] tracking-tight">New Request</span>
        </button>

        <button
          onClick={() => setActiveScreen('hospital_map')}
          className={`py-2 px-1 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer ${
            activeScreen === 'hospital_map'
              ? 'bg-teal-50 text-teal-800 font-extrabold'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Compass className={`w-5 h-5 mb-0.5 ${activeScreen === 'hospital_map' ? 'text-teal-600' : 'text-slate-400'}`} />
          <span className="text-[10px] tracking-tight">Hospitals</span>
        </button>

        <button
          onClick={() => setActiveScreen('ambulance_tracking')}
          className={`relative py-2 px-1 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer ${
            activeScreen === 'ambulance_tracking'
              ? 'bg-teal-50 text-teal-800 font-extrabold'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          {hasActiveRequest && (
            <span className="absolute top-1.5 right-6 w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
          )}
          <Navigation className={`w-5 h-5 mb-0.5 ${activeScreen === 'ambulance_tracking' ? 'text-teal-600' : 'text-slate-400'}`} />
          <span className="text-[10px] tracking-tight">Active Track</span>
        </button>
      </div>
    </div>
  );
};
