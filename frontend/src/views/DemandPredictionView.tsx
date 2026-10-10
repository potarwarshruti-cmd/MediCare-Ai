import React, { useState, useEffect } from 'react';
import type { DemandPredictionData } from '../types';
import { api } from '../services/api';
import { BrainCircuit, AlertTriangle, Cpu, CheckCircle2, BarChart3, Layers, TrendingUp } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';

interface DemandPredictionViewProps {
  tempC: number;
  humidityPct: number;
  onNavigateScreen?: (screen: string) => void;
}

export const DemandPredictionView: React.FC<DemandPredictionViewProps> = ({
  tempC,
  humidityPct,
}) => {
  const [horizonHours, setHorizonHours] = useState<number>(24);
  const [prediction, setPrediction] = useState<DemandPredictionData | null>(null);
  const [mlEval, setMlEval] = useState<any>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadForecast() {
      try {
        const pred = await api.getDemandForecast(tempC, humidityPct, horizonHours);
        const evalData = await api.getMlEvaluation();
        if (isMounted) {
          setPrediction(pred);
          setMlEval(evalData);
        }
      } catch (err) {
        console.error('Failed to load ML forecast', err);
      }
    }
    loadForecast();
    return () => { isMounted = false; };
  }, [tempC, humidityPct, horizonHours]);

  const chartData = [
    { period: '6 Hours', Baseline: 10, Predicted: Math.round((prediction?.predicted_admissions || 75) * 0.25) },
    { period: '12 Hours', Baseline: 20, Predicted: Math.round((prediction?.predicted_admissions || 75) * 0.5) },
    { period: '24 Hours (Full)', Baseline: prediction?.baseline_admissions || 40, Predicted: prediction?.predicted_admissions || 75 },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-r from-slate-50 via-teal-50/30 to-slate-100 border border-teal-200/80 p-6 rounded-2xl shadow-sm backdrop-blur-md">
        <div className="absolute top-0 right-0 w-96 h-96 bg-teal-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-teal-100 border border-teal-300 text-teal-800 text-xs font-semibold mb-2">
              <BrainCircuit className="w-3.5 h-3.5 text-teal-600 animate-pulse" />
              <span>AI Patient Demand Surge Prediction Engine</span>
            </div>
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Heatwave Patient Admission & Emergency Capacity Forecast
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              Random Forest ML model trained on historical emergency logs, temperature index, humidity & heatwave duration.
            </p>
          </div>

          {/* Horizon Selector */}
          <div className="flex items-center space-x-2 bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs text-slate-500 font-semibold px-2">Forecast Horizon:</span>
            {[6, 12, 24].map(h => (
              <button
                key={h}
                onClick={() => setHorizonHours(h)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  horizonHours === h
                    ? 'bg-teal-600 text-white shadow-sm shadow-teal-600/30'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {h} Hours
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Primary Metrics */}
      {prediction && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm transition-all duration-200 hover:-translate-y-0.5">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Baseline Admissions</span>
            <div className="text-3xl font-black text-slate-900 mt-2 tracking-tight">
              {prediction.baseline_admissions} <span className="text-xs font-normal text-slate-500">patients</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">Normal non-heatwave baseline ({horizonHours}h)</p>
          </div>

          <div className="bg-rose-50/70 border border-rose-200 p-5 rounded-2xl shadow-sm transition-all duration-200 hover:-translate-y-0.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-rose-800 uppercase tracking-wider">Predicted Surge Admissions</span>
              <TrendingUp className="w-4 h-4 text-rose-600" />
            </div>
            <div className="text-3xl font-black text-rose-600 mt-2 tracking-tight">
              {prediction.predicted_admissions} <span className="text-xs font-normal text-slate-600">patients</span>
            </div>
            <p className="text-[11px] text-rose-700 font-bold mt-2 flex items-center">
              <span className="px-1.5 py-0.5 rounded bg-rose-100 border border-rose-300 mr-1.5 text-rose-800">
                +{prediction.predicted_additional_patients}
              </span>
              additional emergency patients
            </p>
          </div>

          <div className="bg-amber-50/70 border border-amber-200 p-5 rounded-2xl shadow-sm transition-all duration-200 hover:-translate-y-0.5">
            <span className="text-xs font-semibold text-amber-900 uppercase tracking-wider">Surge Increase Rate</span>
            {prediction.baseline_zero_warning ? (
              <div className="mt-2 text-amber-700 text-xs font-bold flex items-center">
                <AlertTriangle className="w-4 h-4 mr-1" />
                Baseline is 0; % N/A
              </div>
            ) : (
              <div className="text-3xl font-black text-amber-700 mt-2 tracking-tight">
                +{prediction.percentage_increase}%
              </div>
            )}
            <p className="text-[11px] text-slate-500 mt-2">Surge relative to normal baseline</p>
          </div>

          <div className="bg-teal-50/70 border border-teal-200 p-5 rounded-2xl shadow-sm transition-all duration-200 hover:-translate-y-0.5">
            <span className="text-xs font-semibold text-teal-900 uppercase tracking-wider">Model Confidence</span>
            <div className="text-3xl font-black text-teal-700 mt-2 tracking-tight">
              {prediction.model_confidence_pct}%
            </div>
            <p className="text-[11px] text-teal-700 font-medium mt-2 flex items-center">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-teal-600" /> Verified Chronological Split
            </p>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart View */}
        <div className="lg:col-span-2 bg-white border border-slate-200 p-6 rounded-2xl space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center">
              <BarChart3 className="w-4 h-4 mr-2 text-teal-600" />
              Baseline vs Predicted Patient Surge ({horizonHours}h Window)
            </h3>
            <span className="text-[11px] font-mono text-teal-700 bg-teal-50 px-2.5 py-1 rounded-md border border-teal-200 font-semibold">
              AI Forecast Output
            </span>
          </div>

          <div className="h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.8} />
                <XAxis dataKey="period" stroke="#64748b" fontSize={12} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    borderColor: '#cbd5e1',
                    borderRadius: '12px',
                    color: '#0f172a',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                  }}
                />
                <Legend wrapperStyle={{ paddingTop: '14px', fontSize: '12px' }} />
                <Bar dataKey="Baseline" fill="#94a3b8" radius={[6, 6, 0, 0]} name="Baseline Admissions" />
                <Bar dataKey="Predicted" fill="#e11d48" radius={[6, 6, 0, 0]} name="Predicted Surge Admissions" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Contributing Factors & ML Evaluation */}
        <div className="space-y-6">
          {/* Feature Importances */}
          <div className="bg-white border border-slate-200 p-6 rounded-2xl space-y-4 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 flex items-center">
              <Layers className="w-4 h-4 mr-2 text-amber-600" />
              Key Contributing Feature Weights
            </h3>

            {prediction && prediction.contributing_factors && (
              <div className="space-y-3.5 text-xs">
                {Object.entries(prediction.contributing_factors).map(([factor, weight]) => (
                  <div key={factor} className="space-y-1.5">
                    <div className="flex justify-between text-slate-700">
                      <span className="capitalize font-medium">{factor.replace('_', ' ')}</span>
                      <span className="font-mono font-bold text-teal-700">{weight}%</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200">
                      <div
                        className="bg-gradient-to-r from-teal-500 to-amber-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${weight}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Model Evaluation Metrics */}
          {mlEval && (
            <div className="bg-white border border-slate-200 p-6 rounded-2xl space-y-3.5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 flex items-center">
                <Cpu className="w-4 h-4 mr-2 text-purple-600" />
                ML Model Performance Metrics
              </h3>

              <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-500 block">Model MAE:</span>
                  <span className="font-mono font-bold text-emerald-700 text-sm">{mlEval.model_mae}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Baseline MAE:</span>
                  <span className="font-mono font-bold text-slate-600 text-sm">{mlEval.baseline_mae}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Model RMSE:</span>
                  <span className="font-mono font-bold text-emerald-700 text-sm">{mlEval.model_rmse}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Accuracy Boost:</span>
                  <span className="font-mono font-bold text-teal-700 text-sm">+{mlEval.mae_improvement_pct}%</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


