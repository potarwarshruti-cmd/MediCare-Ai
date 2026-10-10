import React from 'react';
import type { UserRole } from '../types';
import { Ambulance, Building2, Settings, Bell, Activity } from 'lucide-react';

interface HeaderProps {
  currentRole: UserRole;
  setRole: (role: UserRole) => void;
  activeScreen: string;
  setActiveScreen: (screen: string) => void;
  unreadNotifications: number;
  onRunDemo?: () => void;
  isDemoRunning?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentRole,
  setRole,
  activeScreen,
  setActiveScreen,
  unreadNotifications,
}) => {
  return (
    <header className="bg-white/90 backdrop-blur-xl text-slate-900 border-b border-slate-200 sticky top-0 z-50 shadow-sm max-w-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap md:flex-nowrap items-center justify-between min-h-[4rem] py-2 md:py-0 gap-3">
          {/* Logo */}
          <div className="flex items-center space-x-3 cursor-pointer group" onClick={() => setActiveScreen('admin_dashboard')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-600 to-emerald-600 flex items-center justify-center shadow-md shadow-teal-600/20 group-hover:scale-105 transition-transform duration-200">
              <Activity className="w-5 h-5 text-white font-bold" />
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="text-xl font-black tracking-tight text-slate-900">
                  MediCare AI
                </span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-teal-50 text-teal-700 border border-teal-200">
                  PRO
                </span>
              </div>
              <span className="block text-[10px] text-slate-500 font-mono font-semibold tracking-wider uppercase">
                Heatwave & Ambulance Platform
              </span>
            </div>
          </div>

          {/* Nav Links based on Role */}
          <nav className="hidden lg:flex space-x-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
            {currentRole === 'admin' && (
              <>
                <button
                  onClick={() => setActiveScreen('admin_dashboard')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                    activeScreen === 'admin_dashboard'
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  Admin Hub
                </button>
                <button
                  onClick={() => setActiveScreen('heat_warning')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                    activeScreen === 'heat_warning'
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  Heat Warning (1.5km)
                </button>
                <button
                  onClick={() => setActiveScreen('demand_prediction')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                    activeScreen === 'demand_prediction'
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  AI Demand Surge
                </button>
                <button
                  onClick={() => setActiveScreen('audit_history')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                    activeScreen === 'audit_history'
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  Audit Trail
                </button>
              </>
            )}

            {currentRole === 'hospital_staff' && (
              <>
                <button
                  onClick={() => setActiveScreen('hospital_preparedness')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                    activeScreen === 'hospital_preparedness'
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  Readiness Checklist
                </button>
                <button
                  onClick={() => setActiveScreen('incoming_ambulances')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                    activeScreen === 'incoming_ambulances'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  Incoming Ambulances
                </button>
                <button
                  onClick={() => setActiveScreen('data_integration')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                    activeScreen === 'data_integration'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  ERP & File Integration
                </button>
              </>
            )}

            {currentRole === 'ambulance' && (
              <>
                <button
                  onClick={() => setActiveScreen('ambulance_entry')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                    activeScreen === 'ambulance_entry'
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  Emergency Dispatch Form
                </button>
                <button
                  onClick={() => setActiveScreen('hospital_map')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                    activeScreen === 'hospital_map'
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  Destination Ranking Map
                </button>
                <button
                  onClick={() => setActiveScreen('ambulance_tracking')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                    activeScreen === 'ambulance_tracking'
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  Active Transport Track
                </button>
              </>
            )}
          </nav>

          {/* Right Actions */}
          <div className="flex items-center space-x-3">
            {/* Role Selector */}
            <div className="bg-slate-100 p-1 rounded-xl flex items-center border border-slate-200">
              <button
                onClick={() => { setRole('admin'); setActiveScreen('admin_dashboard'); }}
                className={`px-2.5 py-1 rounded-lg text-xs font-extrabold flex items-center transition-all cursor-pointer ${
                  currentRole === 'admin' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-950'
                }`}
                title="Administrator Role"
              >
                <Settings className="w-3.5 h-3.5 mr-1" />
                Admin
              </button>

              <button
                onClick={() => { setRole('hospital_staff'); setActiveScreen('hospital_preparedness'); }}
                className={`px-2.5 py-1 rounded-lg text-xs font-extrabold flex items-center transition-all cursor-pointer ${
                  currentRole === 'hospital_staff' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-950'
                }`}
                title="Hospital Staff Role"
              >
                <Building2 className="w-3.5 h-3.5 mr-1" />
                Hospital
              </button>

              <button
                onClick={() => { setRole('ambulance'); setActiveScreen('ambulance_entry'); }}
                className={`px-2.5 py-1 rounded-lg text-xs font-extrabold flex items-center transition-all cursor-pointer ${
                  currentRole === 'ambulance' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-950'
                }`}
                title="Ambulance Personnel Role"
              >
                <Ambulance className="w-3.5 h-3.5 mr-1" />
                Ambulance
              </button>
            </div>

            {/* Notifications Button */}
            <div className="relative cursor-pointer" onClick={() => setActiveScreen('audit_history')}>
              <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center hover:bg-slate-200 transition">
                <Bell className="w-4 h-4 text-slate-700" />
                {unreadNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-600 text-[10px] font-black text-white flex items-center justify-center animate-bounce shadow-md shadow-rose-500/40">
                    {unreadNotifications}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

