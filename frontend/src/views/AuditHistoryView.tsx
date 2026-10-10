import React, { useState, useEffect } from 'react';
import type { AuditLogData, NotificationData } from '../types';
import { api } from '../services/api';
import { History, Bell, FileText, ShieldCheck } from 'lucide-react';

export const AuditHistoryView: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogData[]>([]);
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadLogs() {
      setLoading(true);
      try {
        const auditRes = await api.getAuditLogs();
        const noteRes = await api.getNotifications();
        if (isMounted) {
          setLogs(auditRes);
          setNotifications(noteRes);
        }
      } catch (err) {
        console.error('Failed to load audit logs', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadLogs();
    return () => { isMounted = false; };
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-r from-slate-50 via-purple-50/30 to-slate-100 border border-purple-200/80 p-6 rounded-2xl shadow-sm backdrop-blur-md">
        <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-purple-100 border border-purple-300 text-purple-800 text-xs font-semibold mb-2">
            <History className="w-3.5 h-3.5 text-purple-600" />
            <span>Compliance Audit Trail & Notification Log</span>
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            System Audit Trail, Event Alerts & Regulatory Compliance Log
          </h2>
          <p className="text-xs text-slate-600 mt-1">
            Immutably logs all heatwave warnings, hospital resource changes & emergency transport requests.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Audit Logs Table */}
        <div className="lg:col-span-2 bg-white border border-slate-200 p-6 rounded-2xl space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center">
              <FileText className="w-4 h-4 mr-2 text-teal-600" />
              System Audit History Records ({logs.length})
            </h3>
            <span className="text-xs text-teal-700 font-mono flex items-center font-semibold">
              <ShieldCheck className="w-3.5 h-3.5 mr-1 text-teal-600" /> Audit Log Verified
            </span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-slate-500 text-xs">Loading audit records...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-bold">
                  <tr>
                    <th className="px-4 py-3 rounded-l-lg">Timestamp</th>
                    <th className="px-4 py-3">Role / Operator</th>
                    <th className="px-4 py-3">Action Event</th>
                    <th className="px-4 py-3 rounded-r-lg">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {logs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 font-mono text-[10px] text-slate-500">{log.timestamp}</td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-slate-900">{log.user_name}</span>{' '}
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-teal-800 uppercase">
                          {log.user_role}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-teal-700">{log.action}</td>
                      <td className="px-4 py-3 text-slate-700 text-[11px] leading-relaxed">{log.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Col: Notifications Feed */}
        <div className="bg-white border border-slate-200 p-6 rounded-2xl space-y-4 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 flex items-center">
            <Bell className="w-4 h-4 mr-2 text-amber-600" />
            Live In-App Notification Feed
          </h3>

          <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
            {notifications.map(n => (
              <div key={n.id} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 hover:border-slate-300 transition">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-xs text-amber-900">{n.title}</span>
                  <span className="text-[9px] font-mono text-slate-500">{n.created_at}</span>
                </div>
                <p className="text-[11px] text-slate-700 leading-normal">{n.message}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};


