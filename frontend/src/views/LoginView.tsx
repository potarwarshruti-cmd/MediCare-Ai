import React from 'react';
import type { UserRole } from '../types';
import { ShieldAlert, Ambulance, Building2, ChevronRight, Cpu } from 'lucide-react';

interface LoginViewProps {
  onSelectRole: (role: UserRole) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onSelectRole }) => {
  return (
    <div className="min-h-[85vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-slate-50">
      <div className="max-w-4xl w-full space-y-8">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-teal-100 border border-teal-300 text-teal-800 text-xs font-semibold">
            <Cpu className="w-3.5 h-3.5 animate-pulse text-teal-600" />
            <span>Hackathon HC-02 Problem Solution</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight">
            MediCare AI Platform
          </h1>
          <p className="text-slate-600 text-base max-w-2xl mx-auto">
            Climate-Based Heatwave Hospital Demand Prediction & Smart Emergency Ambulance Coordination System
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
          {/* Admin Role Card */}
          <div
            onClick={() => onSelectRole('admin')}
            className="group relative bg-white border border-slate-200 hover:border-teal-400 rounded-2xl p-6 transition-all duration-300 shadow-sm hover:shadow-md cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 rounded-xl bg-purple-100 border border-purple-300 text-purple-800 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <ShieldAlert className="w-6 h-6 text-purple-700" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2 group-hover:text-teal-700 transition">
                Regional Administrator
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed mb-4">
                Monitor weather risk, configure 1.5 km alert thresholds, review ML demand forecasts, and manage regional hospital readiness.
              </p>
            </div>
            <div className="flex items-center text-xs font-bold text-purple-700 group-hover:text-teal-700">
              <span>Access Admin Hub</span>
              <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Hospital Staff Role Card */}
          <div
            onClick={() => onSelectRole('hospital_staff')}
            className="group relative bg-white border border-slate-200 hover:border-teal-400 rounded-2xl p-6 transition-all duration-300 shadow-sm hover:shadow-md cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 rounded-xl bg-teal-100 border border-teal-300 text-teal-800 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Building2 className="w-6 h-6 text-teal-700" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2 group-hover:text-teal-700 transition">
                Hospital Staff
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed mb-4">
                Receive heatwave alerts, update bed & ICU availability, acknowledge readiness, view AI stock recommendations & accept incoming ambulances.
              </p>
            </div>
            <div className="flex items-center text-xs font-bold text-teal-700 group-hover:text-teal-800">
              <span>Access Hospital Workstation</span>
              <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Ambulance Personnel Role Card */}
          <div
            onClick={() => onSelectRole('ambulance')}
            className="group relative bg-white border border-slate-200 hover:border-teal-400 rounded-2xl p-6 transition-all duration-300 shadow-sm hover:shadow-md cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 rounded-xl bg-amber-100 border border-amber-300 text-amber-900 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Ambulance className="w-6 h-6 text-amber-700" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2 group-hover:text-teal-700 transition">
                Ambulance Personnel
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed mb-4">
                Enter emergency patient condition, rank nearby suitable hospitals using multi-criteria AI, request destination & navigate route.
              </p>
            </div>
            <div className="flex items-center text-xs font-bold text-amber-800 group-hover:text-teal-700">
              <span>Access Dispatch Form</span>
              <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

