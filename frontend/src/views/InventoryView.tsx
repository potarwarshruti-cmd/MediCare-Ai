import React, { useState, useEffect, useCallback } from 'react';
import type { AIInventoryPlannerResponse, InventoryItem, StockRecommendationData, HospitalData } from '../types';
import { api } from '../services/api';
import {
  Package, ShoppingCart, Layers, CheckCircle, RefreshCw, Plus, Edit2, AlertTriangle,
  FlaskConical, Info, Clock, Wifi, WifiOff, Save, X
} from 'lucide-react';

interface InventoryViewProps {
  hospital: HospitalData;
  tempC: number;
  humidityPct: number;
  onNavigateScreen: (screen: string) => void;
}

type ActiveTab = 'planner' | 'inventory';

const FRESHNESS_BADGE: Record<string, { label: string; cls: string }> = {
  LIVE:   { label: 'LIVE',   cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  RECENT: { label: 'RECENT', cls: 'bg-sky-100 text-sky-800 border-sky-300' },
  STALE:  { label: 'STALE',  cls: 'bg-amber-100 text-amber-900 border-amber-300' },
  MANUAL: { label: 'MANUAL', cls: 'bg-violet-100 text-violet-800 border-violet-300' },
};

function FreshnessBadge({ status }: { status?: string }) {
  const cfg = FRESHNESS_BADGE[status || 'STALE'] ?? FRESHNESS_BADGE.STALE;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${cfg.cls}`}>
      {status === 'LIVE' && <Wifi className="w-2.5 h-2.5" />}
      {status === 'STALE' && <WifiOff className="w-2.5 h-2.5" />}
      {status === 'MANUAL' && <Edit2 className="w-2.5 h-2.5" />}
      {status === 'RECENT' && <Clock className="w-2.5 h-2.5" />}
      {cfg.label}
    </span>
  );
}

function DemoBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border bg-slate-100 text-slate-500 border-slate-300">
      <Info className="w-2.5 h-2.5" /> DEMO
    </span>
  );
}

function SourceTag({ source }: { source?: string }) {
  const labels: Record<string, string> = {
    SEED_DATA: 'Seed',
    MANUAL_ENTRY: 'Manual',
    EXCEL_IMPORT: 'Excel',
    CSV_IMPORT: 'CSV',
    ERP_FHIR_R4: 'FHIR',
    ERP_EPIC_EHR: 'Epic',
    ERP_CERNER_EHR: 'Cerner',
  };
  const label = labels[source || 'SEED_DATA'] || source || 'Unknown';
  return <span className="text-[10px] font-mono text-slate-500">{label}</span>;
}

// Inline editor for an inventory item
function EditRow({
  item,
  hospitalId,
  onSaved,
  onCancel,
}: {
  item: InventoryItem;
  hospitalId: number;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [usable, setUsable] = useState(item.usable_quantity);
  const [incoming, setIncoming] = useState(item.incoming_quantity);
  const [safety, setSafety] = useState(item.safety_stock);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await api.updateInventoryItem(hospitalId, item.id, {
        usable_quantity: usable,
        incoming_quantity: incoming,
        safety_stock: safety,
        lead_time_days: item.lead_time_days,
      });
      onSaved();
    } catch (e) {
      console.error(e);
      alert('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="bg-violet-50 border-t border-b border-violet-200">
      <td className="px-4 py-2 font-bold text-slate-900" colSpan={1}>{item.item_name}</td>
      <td className="px-4 py-2 text-slate-600">{item.category}</td>
      <td className="px-4 py-2">
        <input type="number" min={0} value={usable} onChange={e => setUsable(Number(e.target.value))}
          className="w-20 border border-violet-400 rounded px-2 py-1 text-xs font-bold focus:outline-none" />
      </td>
      <td className="px-4 py-2">
        <input type="number" min={0} value={incoming} onChange={e => setIncoming(Number(e.target.value))}
          className="w-20 border border-violet-400 rounded px-2 py-1 text-xs font-bold focus:outline-none" />
      </td>
      <td className="px-4 py-2">
        <input type="number" min={0} value={safety} onChange={e => setSafety(Number(e.target.value))}
          className="w-20 border border-violet-400 rounded px-2 py-1 text-xs font-bold focus:outline-none" />
      </td>
      <td className="px-4 py-2 text-slate-500">{item.lead_time_days} day(s)</td>
      <td className="px-4 py-2" colSpan={2}>
        <div className="flex items-center space-x-2">
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1 px-2 py-1 bg-teal-600 text-white text-[10px] font-bold rounded transition hover:bg-teal-700 cursor-pointer disabled:opacity-50">
            <Save className="w-3 h-3" /> {saving ? 'Saving...' : 'Save'}
          </button>
          <button onClick={onCancel}
            className="flex items-center gap-1 px-2 py-1 bg-slate-200 text-slate-700 text-[10px] font-bold rounded hover:bg-slate-300 cursor-pointer">
            <X className="w-3 h-3" /> Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  hospital, tempC, humidityPct, onNavigateScreen
}) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('planner');
  const [plannerData, setPlannerData] = useState<AIInventoryPlannerResponse | null>(null);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [orderingItemId, setOrderingItemId] = useState<number | null>(null);
  const [orderQty, setOrderQty] = useState(0);
  const [orderBusy, setOrderBusy] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [planner, inv] = await Promise.all([
        api.getAIInventoryPlanner(hospital.id, tempC, humidityPct),
        api.getInventory(hospital.id),
      ]);
      setPlannerData(planner);
      setInventoryItems(inv);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Failed to load inventory data', err);
    } finally {
      setLoading(false);
    }
  }, [hospital.id, tempC, humidityPct]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5 * 60 * 1000); // auto-refresh every 5 min
    return () => clearInterval(interval);
  }, [loadData]);

  async function handlePlaceOrder(itemId: number) {
    if (orderQty <= 0) return;
    setOrderBusy(true);
    try {
      await api.placeStockOrder(hospital.id, itemId, orderQty);
      setOrderingItemId(null);
      setOrderQty(0);
      await loadData();
    } catch (e) {
      console.error(e);
    } finally {
      setOrderBusy(false);
    }
  }

  const demoItemCount = inventoryItems.filter(i => i.is_demo_data).length;
  const hasAnyRealSource = (plannerData?.has_real_data) ?? false;

  return (
    <div className="space-y-6 min-w-0 max-w-full">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-r from-slate-50 via-teal-50/30 to-slate-100 border border-teal-200/80 p-5 sm:p-6 rounded-2xl shadow-sm backdrop-blur-md min-w-0 max-w-full">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 min-w-0 max-w-full">
          <div className="min-w-0 max-w-full flex-1">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-teal-100 border border-teal-300 text-teal-800 text-xs font-semibold mb-2">
              <Package className="w-3.5 h-3.5 text-teal-600 shrink-0" />
              <span>AI Inventory & Surge Stock Replenishment Planner</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight break-words min-w-0">
              Medical Supplies & Stock Shortage Recommendation
            </h2>
            <p className="text-xs text-slate-600 mt-1 font-semibold break-words">{hospital.name}</p>
            <p className="text-[11px] text-slate-500 mt-0.5 break-words">
              Computes replenishment quantities based on AI surge forecasts, safety stock thresholds & supplier lead times.
              {lastRefreshed && (
                <span className="ml-2 text-slate-400">Last refreshed: {lastRefreshed.toLocaleTimeString()}</span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 max-w-full">
            <button onClick={loadData} disabled={loading}
              className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl border border-slate-300 transition flex items-center space-x-1.5 cursor-pointer shadow-sm">
              <RefreshCw className={`w-3.5 h-3.5 text-teal-600 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button onClick={() => onNavigateScreen('demand_prediction')}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl border border-slate-300 transition flex items-center space-x-2 cursor-pointer shadow-sm">
              <Layers className="w-3.5 h-3.5 text-amber-600" />
              <span>View Patient Surge Model</span>
            </button>
          </div>
        </div>
      </div>

      {/* Data Source Banner */}
      {!loading && plannerData?.data_source_notice && (
        <div className="flex items-start space-x-3 p-4 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold mb-0.5">Demo Data in Use ({demoItemCount} items)</p>
            <p className="text-amber-800">{plannerData.data_source_notice}</p>
            <p className="mt-1 text-amber-700">
              To connect real data: use the{' '}
              <button onClick={() => onNavigateScreen('integration')}
                className="underline font-bold cursor-pointer">ERP & File Integration</button>{' '}
              module to upload an Excel/CSV or connect an ERP API.
            </p>
          </div>
        </div>
      )}

      {/* Stats Row */}
      {!loading && plannerData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'AI Forecast Patients', value: `+${Math.round(plannerData.additional_patients_24h)}`, cls: 'text-rose-700', icon: <FlaskConical className="w-4 h-4 text-rose-500" /> },
            { label: 'High Priority Shortages', value: plannerData.stock_recommendations.filter(r => r.priority === 'High').length, cls: 'text-rose-700', icon: <AlertTriangle className="w-4 h-4 text-rose-500" /> },
            { label: 'Total Inventory Items', value: inventoryItems.length, cls: 'text-teal-700', icon: <Package className="w-4 h-4 text-teal-500" /> },
            { label: 'Real-Source Items', value: `${inventoryItems.filter(i => !i.is_demo_data).length} / ${inventoryItems.length}`, cls: hasAnyRealSource ? 'text-emerald-700' : 'text-slate-500', icon: <Wifi className="w-4 h-4" /> },
          ].map(stat => (
            <div key={stat.label} className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{stat.label}</span>
                {stat.icon}
              </div>
              <p className={`text-2xl font-black ${stat.cls}`}>{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center space-x-2 bg-slate-100/80 border border-slate-200 rounded-xl p-1.5">
        <button onClick={() => setActiveTab('planner')}
          className={`px-4 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer flex items-center space-x-1.5 ${
            activeTab === 'planner' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}>
          <ShoppingCart className="w-3.5 h-3.5" />
          <span>AI Shortage Planner</span>
        </button>
        <button onClick={() => setActiveTab('inventory')}
          className={`px-4 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer flex items-center space-x-1.5 ${
            activeTab === 'inventory' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}>
          <Package className="w-3.5 h-3.5" />
          <span>Live Inventory ({inventoryItems.length})</span>
        </button>
      </div>

      {/* TAB 1: AI Shortage Planner */}
      {activeTab === 'planner' && (
        <div className="bg-white border border-slate-200 p-6 rounded-2xl space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center">
              <ShoppingCart className="w-4 h-4 mr-2 text-teal-600" />
              AI Stock Replenishment & Shortage Projection Table
            </h3>
            <span className="text-xs text-slate-500 font-mono">Rec = Surge Forecast + Safety Buffer</span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-500" />
              Computing AI stock recommendations from live database...
            </div>
          ) : plannerData && plannerData.stock_recommendations.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-bold">
                  <tr>
                    <th className="px-4 py-3 rounded-l-lg">Item Name</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Usable Stock</th>
                    <th className="px-4 py-3">Incoming Orders</th>
                    <th className="px-4 py-3">Forecast Consumption</th>
                    <th className="px-4 py-3">Recommended Stock</th>
                    <th className="px-4 py-3">Shortage Qty</th>
                    <th className="px-4 py-3">Lead Time</th>
                    <th className="px-4 py-3">Source / Freshness</th>
                    <th className="px-4 py-3 rounded-r-lg">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {plannerData.stock_recommendations.map((item: StockRecommendationData, idx: number) => (
                    <tr key={idx} className={`hover:bg-slate-50 transition ${item.shortage_quantity > 0 ? 'bg-rose-50/30' : ''}`}>
                      <td className="px-4 py-3 font-bold text-slate-900">
                        <div className="flex items-center gap-2">
                          {item.item_name}
                          {item.is_demo_data && <DemoBadge />}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{item.category}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800 font-mono">{item.current_usable_stock} {item.unit}</td>
                      <td className="px-4 py-3 text-slate-600 font-mono">{item.confirmed_incoming_stock} {item.unit}</td>
                      <td className="px-4 py-3 font-semibold text-amber-700 font-mono">{item.forecast_consumption} {item.unit}</td>
                      <td className="px-4 py-3 font-bold text-teal-700 font-mono">{item.recommended_stock} {item.unit}</td>
                      <td className="px-4 py-3 font-black text-rose-600 font-mono">
                        {item.shortage_quantity > 0 ? `+${item.shortage_quantity} ${item.unit}` : (
                          <span className="text-emerald-700">None</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600 font-mono">{item.lead_time_days}d</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <FreshnessBadge status={item.freshness_status} />
                          <SourceTag source={item.data_source} />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold inline-block ${
                            item.priority === 'High' ? 'bg-rose-100 text-rose-800 border border-rose-300'
                            : item.priority === 'Medium' ? 'bg-amber-100 text-amber-900 border border-amber-300'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          }`}>{item.priority}</span>
                          {item.shortage_quantity > 0 && item.item_id != null ? (
                            orderingItemId === item.item_id ? (
                              <div className="flex items-center gap-1">
                                <input type="number" min={1} value={orderQty} onChange={e => setOrderQty(Number(e.target.value))}
                                  className="w-16 border border-rose-400 rounded px-1 py-0.5 text-xs font-bold focus:outline-none" />
                                <button onClick={() => handlePlaceOrder(item.item_id!)} disabled={orderBusy}
                                  className="px-2 py-0.5 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold rounded cursor-pointer disabled:opacity-50">
                                  {orderBusy ? '...' : 'Order'}
                                </button>
                                <button onClick={() => setOrderingItemId(null)}
                                  className="px-1 py-0.5 text-slate-500 hover:text-slate-800 cursor-pointer"><X className="w-3 h-3" /></button>
                              </div>
                            ) : (
                              <button onClick={() => { setOrderingItemId(item.item_id!); setOrderQty(item.shortage_quantity); }}
                                className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-[10px] rounded-lg transition shadow-sm cursor-pointer">
                                Order Stock
                              </button>
                            )
                          ) : item.shortage_quantity === 0 ? (
                            <span className="text-[10px] font-bold text-emerald-700 flex items-center">
                              <CheckCircle className="w-3 h-3 mr-1 text-emerald-600" /> Sufficient
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-500 text-xs">
              No inventory items found. Add items manually or import via the ERP & File Integration module.
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Live Inventory with Inline Edit */}
      {activeTab === 'inventory' && (
        <div className="bg-white border border-slate-200 p-6 rounded-2xl space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center">
              <Package className="w-4 h-4 mr-2 text-teal-600" />
              Live Inventory — Usable Stock, Incoming Orders & Safety Buffers
            </h3>
            <p className="text-[11px] text-slate-500">Click <Edit2 className="w-2.5 h-2.5 inline" /> Edit to manually correct values. Changes sync to the Standardized Schema.</p>
          </div>

          {loading ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-500" />
              Loading live inventory from database...
            </div>
          ) : inventoryItems.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              No inventory items found. Use the ERP & File Integration tab to import or add items manually.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-bold sticky top-0">
                  <tr>
                    <th className="px-4 py-3 rounded-l-lg">Item Name</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Usable Stock</th>
                    <th className="px-4 py-3">Incoming Orders</th>
                    <th className="px-4 py-3">Safety Stock</th>
                    <th className="px-4 py-3">Lead Time</th>
                    <th className="px-4 py-3">Source / Freshness</th>
                    <th className="px-4 py-3 rounded-r-lg">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono">
                  {inventoryItems.map(item => (
                    editingItemId === item.id ? (
                      <EditRow
                        key={item.id}
                        item={item}
                        hospitalId={hospital.id}
                        onSaved={() => { setEditingItemId(null); loadData(); }}
                        onCancel={() => setEditingItemId(null)}
                      />
                    ) : (
                      <tr key={item.id} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-3 font-bold text-slate-900 font-sans">
                          <div className="flex items-center gap-2">
                            {item.item_name}
                            {item.is_demo_data && <DemoBadge />}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 font-sans">{item.category}</td>
                        <td className="px-4 py-3 font-bold text-teal-700">{item.usable_quantity} {item.unit}</td>
                        <td className="px-4 py-3 text-slate-600">{item.incoming_quantity} {item.unit}</td>
                        <td className="px-4 py-3 text-slate-600">{item.safety_stock} {item.unit}</td>
                        <td className="px-4 py-3 text-slate-600">{item.lead_time_days}d</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <FreshnessBadge status={item.freshness_status} />
                            <SourceTag source={item.data_source} />
                          </div>
                        </td>
                        <td className="px-4 py-3 font-sans">
                          <button
                            onClick={() => setEditingItemId(item.id)}
                            className="flex items-center gap-1 px-2.5 py-1 bg-violet-100 hover:bg-violet-200 text-violet-800 text-[10px] font-bold rounded-lg transition cursor-pointer border border-violet-300">
                            <Edit2 className="w-3 h-3" /> Edit
                          </button>
                        </td>
                      </tr>
                    )
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Add item hint */}
          <div className="pt-3 border-t border-slate-200 flex items-center space-x-2 text-xs text-slate-500">
            <Plus className="w-3.5 h-3.5 text-teal-600" />
            <span>To add new inventory items, use the <button onClick={() => onNavigateScreen('integration')} className="font-bold text-teal-700 underline cursor-pointer">ERP & File Integration</button> tab or import an Excel/CSV file.</span>
          </div>
        </div>
      )}
    </div>
  );
};
