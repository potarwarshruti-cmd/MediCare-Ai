import React, { useState, useEffect, useRef } from 'react';
import type { HospitalData, StandardizedResourceRecord, ERPConnectorConfig, DataImportBatchLog, FreshnessStatus, DataSource, AIInventoryPlannerResponse } from '../types';
import { api } from '../services/api';
import * as XLSX from 'xlsx';
import {
  Database, Upload, Cpu, CheckCircle, RefreshCw, FileText,
  Table, ShieldCheck, FileSpreadsheet, FlaskConical, AlertTriangle, Info
} from 'lucide-react';

interface UniversalDataIntegrationViewProps {
  hospital: HospitalData;
  onUpdateResources: () => void;
  onNavigateScreen?: (screen: string) => void;
}

interface ColumnMapping {
  resource_type: string;
  resource_name: string;
  total_capacity: string;
  available_quantity: string;
}

interface ParsedPreviewRow {
  rowNum: number;
  resource_type: string;
  resource_name: string;
  total_capacity: number;
  available_quantity: number;
  status: 'VALID' | 'WARNING' | 'ERROR';
  errorMessage?: string;
  isDuplicate?: boolean;
}

export const UniversalDataIntegrationView: React.FC<UniversalDataIntegrationViewProps> = ({
  hospital,
  onUpdateResources,
  onNavigateScreen: _onNavigateScreen,
}) => {
  const [activeTab, setActiveTab] = useState<'import' | 'erp' | 'standardized' | 'logs' | 'planner'>('import');
  const [plannerData, setPlannerData] = useState<AIInventoryPlannerResponse | null>(null);
  const [plannerLoading, setPlannerLoading] = useState(false);

  // File Upload & Parsing State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>('');
  const [fileType, setFileType] = useState<'CSV' | 'XLSX' | 'XLS'>('CSV');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, any>[]>([]);

  // Mapping State
  const [mapping, setMapping] = useState<ColumnMapping>({
    resource_type: '',
    resource_name: '',
    total_capacity: '',
    available_quantity: '',
  });

  // Parsed Preview & Validation State
  const [parsedPreview, setParsedPreview] = useState<ParsedPreviewRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    total_rows: number;
    imported_rows: number;
    skipped_rows: number;
    error_count: number;
    errors: any[];
  } | null>(null);

  // Standardized DB Records State
  const [records, setRecords] = useState<StandardizedResourceRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);

  // ERP Config State
  const [erpConfig, setErpConfig] = useState<ERPConnectorConfig>({
    hospital_id: hospital.id,
    system_type: 'FHIR_R4',
    endpoint_url: `https://fhir.hospital-${hospital.id}.health.org/r4`,
    auth_type: 'Bearer',
    sync_frequency_minutes: 15,
    is_active: true,
    last_sync_status: 'IDLE',
  });
  const [savingErp, setSavingErp] = useState(false);
  const [syncingErp, setSyncingErp] = useState(false);
  const [erpMsg, setErpMsg] = useState<string | null>(null);

  // Logs State
  const [importLogs, setImportLogs] = useState<DataImportBatchLog[]>([]);

  // Load Standardized Records & ERP Config
  const loadIntegrationData = async () => {
    setLoadingRecords(true);
    try {
      const recs = await api.getStandardizedRecords(hospital.id);
      setRecords(recs);

      const erp = await api.getERPConfig(hospital.id);
      setErpConfig(erp);

      const logs = await api.getImportLogs(hospital.id);
      setImportLogs(logs);
    } catch (err) {
      console.error('Failed to load integration data', err);
    } finally {
      setLoadingRecords(false);
    }
  };

  useEffect(() => {
    loadIntegrationData();
  }, [hospital.id]);

  // Handle File Selection
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toUpperCase() || '';
    setFileName(file.name);
    setFileType(ext === 'XLSX' ? 'XLSX' : ext === 'XLS' ? 'XLS' : 'CSV');
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheet];
        const json: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (json.length === 0) {
          alert('Selected file is empty.');
          return;
        }

        const cols = Object.keys(json[0]);
        setHeaders(cols);
        setRawRows(json);

        // Auto-detect columns
        const autoMap: ColumnMapping = {
          resource_type: cols.find(c => /type|category|group/i.test(c)) || cols[0] || '',
          resource_name: cols.find(c => /name|item|description|resource/i.test(c)) || cols[1] || cols[0] || '',
          total_capacity: cols.find(c => /total|capacity|max|staffed_beds/i.test(c)) || cols[2] || '',
          available_quantity: cols.find(c => /avail|free|usable|quantity/i.test(c)) || cols[3] || '',
        };
        setMapping(autoMap);
      } catch (err) {
        alert(`Failed to parse file: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Re-run field mapping preview when mapping or rawRows change
  useEffect(() => {
    if (rawRows.length === 0) {
      setParsedPreview([]);
      return;
    }

    const existingNames = new Set(records.map(r => r.resource_name.toLowerCase()));

    const parsed: ParsedPreviewRow[] = rawRows.map((row, idx) => {
      const typeVal = String(row[mapping.resource_type] || 'staffed_beds').toLowerCase().trim();
      const nameVal = String(row[mapping.resource_name] || `Resource #${idx + 1}`).trim();
      const totalVal = parseInt(row[mapping.total_capacity]) || 0;
      const availVal = parseInt(row[mapping.available_quantity]) || 0;

      let status: 'VALID' | 'WARNING' | 'ERROR' = 'VALID';
      let errorMessage: string | undefined = undefined;

      if (totalVal < 0 || availVal < 0) {
        status = 'ERROR';
        errorMessage = 'Negative capacity values not allowed.';
      } else if (availVal > totalVal) {
        status = 'ERROR';
        errorMessage = `Available quantity (${availVal}) exceeds total capacity (${totalVal}).`;
      } else if (!nameVal) {
        status = 'ERROR';
        errorMessage = 'Resource name is required.';
      }

      const isDup = existingNames.has(nameVal.toLowerCase());
      if (status === 'VALID' && isDup) {
        status = 'WARNING';
        errorMessage = 'Existing record found in database — will update capacity.';
      }

      // Map raw types to standardized keys
      let resType = 'staffed_beds';
      if (/icu/i.test(typeVal) || /icu/i.test(nameVal)) resType = 'icu_beds';
      else if (/doctor/i.test(typeVal) || /doctor/i.test(nameVal)) resType = 'doctors';
      else if (/nurse/i.test(typeVal) || /nurse/i.test(nameVal)) resType = 'nurses';
      else if (/cooling|blanket/i.test(typeVal) || /cooling/i.test(nameVal)) resType = 'cooling_beds';
      else if (/saline|ors|med|fluid|drug/i.test(typeVal) || /saline|ors/i.test(nameVal)) resType = 'inventory_item';
      else if (/equip|vent|monitor/i.test(typeVal) || /equip/i.test(nameVal)) resType = 'equipment';

      return {
        rowNum: idx + 1,
        resource_type: resType,
        resource_name: nameVal,
        total_capacity: totalVal,
        available_quantity: availVal,
        status,
        errorMessage,
        isDuplicate: isDup,
      };
    });

    setParsedPreview(parsed);
  }, [rawRows, mapping, records]);

  // Execute Batch Import
  const handleExecuteImport = async () => {
    const validRecords = parsedPreview
      .filter(p => p.status !== 'ERROR')
      .map(p => ({
        resource_type: p.resource_type,
        resource_name: p.resource_name,
        total_capacity: p.total_capacity,
        available_quantity: p.available_quantity,
        data_source: fileType === 'CSV' ? 'CSV_IMPORT' : 'EXCEL_IMPORT',
        freshness_status: 'LIVE',
      }));

    if (validRecords.length === 0) {
      alert('No valid records to import. Please correct validation errors.');
      return;
    }

    setImporting(true);
    try {
      const res = await api.batchImportRecords(hospital.id, {
        file_name: fileName || 'Uploaded_File.csv',
        file_type: fileType,
        records: validRecords,
        imported_by: 'Hospital Staff Administrator',
      });
      setImportResult(res);
      await loadIntegrationData();
      onUpdateResources();
    } catch (err) {
      alert(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setImporting(false);
    }
  };

  // ERP Config Save & Test Trigger
  const handleSaveErpConfig = async () => {
    setSavingErp(true);
    try {
      const res = await api.saveERPConfig(hospital.id, erpConfig);
      setErpConfig(res.config);
      setErpMsg('ERP Connector configuration saved successfully.');
      setTimeout(() => setErpMsg(null), 3000);
    } catch (err) {
      setErpMsg(`Failed to save config: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSavingErp(false);
    }
  };

  const handleTriggerErpSync = async () => {
    setSyncingErp(true);
    try {
      const res = await api.triggerERPSync(hospital.id);
      setErpMsg(`Live ERP Sync Completed! ${res.synced_records_count} records synchronized via ${res.system_type}.`);
      await loadIntegrationData();
      onUpdateResources();
    } catch (err) {
      setErpMsg(`ERP Sync Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSyncingErp(false);
    }
  };

  // Inline Resource Correction
  const handleInlineSaveRecord = async (rec: StandardizedResourceRecord, newTotal: number, newAvail: number) => {
    if (newAvail > newTotal) {
      alert('Available quantity cannot exceed total capacity.');
      return;
    }

    try {
      await api.batchImportRecords(hospital.id, {
        file_name: 'Manual_Dashboard_Correction',
        file_type: 'CSV',
        records: [{
          resource_type: rec.resource_type,
          resource_name: rec.resource_name,
          total_capacity: newTotal,
          available_quantity: newAvail,
          data_source: 'MANUAL_ENTRY',
          freshness_status: 'MANUAL',
        }],
        imported_by: 'Hospital Staff',
      });
      await loadIntegrationData();
      onUpdateResources();
    } catch (err) {
      alert(`Update failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Helpers for Source & Freshness badges
  const renderSourceBadge = (src?: DataSource | string) => {
    switch (src) {
      case 'ERP_FHIR':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-300">FHIR R4 API</span>;
      case 'ERP_EPIC':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-300">Epic EHR Webhook</span>;
      case 'ERP_CERNER':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-300">Cerner API</span>;
      case 'EXCEL_IMPORT':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">Excel Upload</span>;
      case 'CSV_IMPORT':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-100 text-teal-800 border border-teal-300">CSV Import</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300">Manual Entry</span>;
    }
  };

  const renderFreshnessBadge = (fresh?: FreshnessStatus | string) => {
    switch (fresh) {
      case 'LIVE':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-ping"></span>
            LIVE
          </span>
        );
      case 'RECENT':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300">RECENT</span>;
      case 'STALE':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">⚠ STALE</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-300">MANUAL</span>;
    }
  };

  return (
    <div className="space-y-6 min-w-0 max-w-full">
      {/* Header */}
      <div className="bg-white border border-slate-200 p-5 sm:p-6 rounded-2xl flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4 shadow-sm min-w-0 max-w-full">
        <div className="min-w-0 max-w-full flex-1">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-teal-100 border border-teal-300 text-teal-900 text-xs font-semibold mb-2">
            <Database className="w-3.5 h-3.5 text-teal-600 shrink-0" />
            <span>Universal Healthcare Data Standardization Engine</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 break-words min-w-0">
            {hospital.name} — Data Integration Hub
          </h2>
          <p className="text-xs text-slate-600 mt-1 break-words">
            Standardize bed, ICU, staffing, medicine & equipment data from any EHR/ERP system (FHIR, Cerner, Epic, Excel/CSV file upload, or Manual Dashboard).
          </p>
        </div>

        {/* Tab Selector Buttons */}
        <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1.5 rounded-xl border border-slate-200 max-w-full w-full xl:w-auto">
          <button
            onClick={() => setActiveTab('import')}
            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer flex items-center space-x-1.5 whitespace-nowrap ${
              activeTab === 'import' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Excel / CSV Import</span>
          </button>
          <button
            onClick={() => setActiveTab('erp')}
            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer flex items-center space-x-1.5 whitespace-nowrap ${
              activeTab === 'erp' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>ERP Connectors</span>
          </button>
          <button
            onClick={() => setActiveTab('standardized')}
            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer flex items-center space-x-1.5 whitespace-nowrap ${
              activeTab === 'standardized' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Table className="w-3.5 h-3.5" />
            <span>Standardized Schema</span>
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer flex items-center space-x-1.5 whitespace-nowrap ${
              activeTab === 'logs' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Import Logs</span>
          </button>
          <button
            onClick={async () => {
              setActiveTab('planner');
              if (!plannerData) {
                setPlannerLoading(true);
                try {
                  const data = await api.getAIInventoryPlanner(hospital.id, 40.0, 65.0);
                  setPlannerData(data);
                } catch(e) { console.error(e); }
                finally { setPlannerLoading(false); }
              }
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer flex items-center space-x-1.5 whitespace-nowrap ${
              activeTab === 'planner' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FlaskConical className="w-3.5 h-3.5" />
            <span>AI Medicine Planner</span>
          </button>
        </div>
      </div>

      {/* ── TAB 1: EXCEL / CSV UPLOAD & MAPPER ── */}
      {activeTab === 'import' && (
        <div className="space-y-6">
          {/* File Selection Box */}
          <div className="bg-white border border-slate-200 p-6 rounded-2xl space-y-4 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 flex items-center">
              <FileSpreadsheet className="w-4 h-4 mr-2 text-teal-600" />
              1. Select Hospital Capacity File (.csv, .xlsx, .xls)
            </h3>

            <div className="border-2 border-dashed border-slate-300 rounded-2xl p-6 text-center hover:border-teal-500 transition cursor-pointer bg-slate-50/50"
                 onClick={() => fileInputRef.current?.click()}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv, .xlsx, .xls"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Upload className="w-8 h-8 text-teal-600 mx-auto mb-2 opacity-80" />
              <p className="text-xs font-bold text-slate-800">
                {fileName ? `Loaded: ${fileName}` : 'Click to Upload or Drag & Drop Excel/CSV File'}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Supports automatically detecting headers for beds, ICU, doctors, nurses, cooling capacity, supplies, and equipment.
              </p>
            </div>

            {/* Field Mapping UI */}
            {headers.length > 0 && (
              <div className="space-y-3 pt-3 border-t border-slate-200">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  2. Verify & Adjust Column Field Mappings
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Resource Category Column</label>
                    <select
                      value={mapping.resource_type}
                      onChange={e => setMapping({ ...mapping, resource_type: e.target.value })}
                      className="w-full h-9 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold px-2 cursor-pointer"
                    >
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Resource Name Column</label>
                    <select
                      value={mapping.resource_name}
                      onChange={e => setMapping({ ...mapping, resource_name: e.target.value })}
                      className="w-full h-9 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold px-2 cursor-pointer"
                    >
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Total Capacity Column</label>
                    <select
                      value={mapping.total_capacity}
                      onChange={e => setMapping({ ...mapping, total_capacity: e.target.value })}
                      className="w-full h-9 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold px-2 cursor-pointer"
                    >
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Available Quantity Column</label>
                    <select
                      value={mapping.available_quantity}
                      onChange={e => setMapping({ ...mapping, available_quantity: e.target.value })}
                      className="w-full h-9 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold px-2 cursor-pointer"
                    >
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Validation & Data Preview Table */}
          {parsedPreview.length > 0 && (
            <div className="bg-white border border-slate-200 p-6 rounded-2xl space-y-4 shadow-sm">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center">
                    <Table className="w-4 h-4 mr-2 text-teal-600" />
                    3. File Data Ingestion Preview & Validation
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {parsedPreview.length} rows detected · {parsedPreview.filter(p => p.status === 'VALID').length} valid · {parsedPreview.filter(p => p.status === 'WARNING').length} warnings · {parsedPreview.filter(p => p.status === 'ERROR').length} errors
                  </p>
                </div>

                <button
                  onClick={handleExecuteImport}
                  disabled={importing || parsedPreview.filter(p => p.status !== 'ERROR').length === 0}
                  className="px-4 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md transition disabled:opacity-50 cursor-pointer flex items-center space-x-1.5 shrink-0"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{importing ? 'Ingesting Data...' : 'Import & Sync Real-Time Database'}</span>
                </button>
              </div>

              {/* Import Result Notification */}
              {importResult && (
                <div className={`p-4 border rounded-xl text-xs font-bold ${
                  importResult.error_count > 0 ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-emerald-50 border-emerald-300 text-emerald-900'
                }`}>
                  <p className="flex items-center space-x-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Import Completed: {importResult.imported_rows} rows imported, {importResult.skipped_rows} skipped, {importResult.error_count} errors.</span>
                  </p>
                </div>
              )}

              {/* Table */}
              <div className="overflow-x-auto max-h-[400px]">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-bold sticky top-0">
                    <tr>
                      <th className="px-3 py-2 rounded-l-lg">Row</th>
                      <th className="px-3 py-2">Category</th>
                      <th className="px-3 py-2">Resource Name</th>
                      <th className="px-3 py-2 text-right">Total Capacity</th>
                      <th className="px-3 py-2 text-right">Available</th>
                      <th className="px-3 py-2">Validation Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-mono">
                    {parsedPreview.map((p) => (
                      <tr key={p.rowNum} className={p.status === 'ERROR' ? 'bg-rose-50' : p.status === 'WARNING' ? 'bg-amber-50/60' : 'hover:bg-slate-50'}>
                        <td className="px-3 py-2 font-bold text-slate-500">#{p.rowNum}</td>
                        <td className="px-3 py-2 font-semibold text-slate-800">{p.resource_type}</td>
                        <td className="px-3 py-2 font-bold text-slate-900">{p.resource_name}</td>
                        <td className="px-3 py-2 text-right font-bold text-slate-900">{p.total_capacity}</td>
                        <td className="px-3 py-2 text-right font-extrabold text-teal-700">{p.available_quantity}</td>
                        <td className="px-3 py-2 font-sans">
                          {p.status === 'VALID' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              ✓ VALID
                            </span>
                          )}
                          {p.status === 'WARNING' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200" title={p.errorMessage}>
                              ⚠ DUPLICATE (OVERWRITE)
                            </span>
                          )}
                          {p.status === 'ERROR' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200" title={p.errorMessage}>
                              ❌ ERROR: {p.errorMessage}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: MODULAR ERP API CONNECTORS ── */}
      {activeTab === 'erp' && (
        <div className="bg-white border border-slate-200 p-6 rounded-2xl space-y-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center">
                <Cpu className="w-4 h-4 mr-2 text-teal-600" />
                Modular EHR/ERP Interoperability Connectors
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Connect directly to hospital Electronic Health Record systems via HL7 FHIR R4, Epic ADT Webhooks, or Cerner Capacity APIs.
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
              Status: {erpConfig.last_sync_status}
            </span>
          </div>

          {erpMsg && (
            <div className="p-3 bg-sky-50 border border-sky-300 rounded-xl text-xs font-bold text-sky-900 flex items-center space-x-2">
              <CheckCircle className="w-4 h-4 text-sky-600 shrink-0" />
              <span>{erpMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">EHR / ERP System Interface</label>
              <select
                value={erpConfig.system_type}
                onChange={e => setErpConfig({ ...erpConfig, system_type: e.target.value as any })}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:bg-white focus:border-teal-500 cursor-pointer"
              >
                <option value="FHIR_R4">HL7 FHIR R4 REST API (Standard Interoperability)</option>
                <option value="EPIC_EHR">Epic Systems ADT / Bed Tracking Webhook</option>
                <option value="CERNER_EHR">Cerner CareAware Capacity Management API</option>
                <option value="CUSTOM_WEBHOOK">Custom Hospital ERP JSON Webhook</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">ERP Endpoint Base URL</label>
              <input
                type="text"
                value={erpConfig.endpoint_url || ''}
                onChange={e => setErpConfig({ ...erpConfig, endpoint_url: e.target.value })}
                placeholder="https://fhir.hospital-domain.org/r4"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Authentication Method</label>
              <select
                value={erpConfig.auth_type}
                onChange={e => setErpConfig({ ...erpConfig, auth_type: e.target.value as any })}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:bg-white focus:border-teal-500 cursor-pointer"
              >
                <option value="Bearer">OAuth 2.0 / Bearer Token</option>
                <option value="APIKey">API Key Header</option>
                <option value="Basic">HTTP Basic Auth</option>
                <option value="None">None (Internal Network)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Automated Sync Frequency</label>
              <select
                value={erpConfig.sync_frequency_minutes}
                onChange={e => setErpConfig({ ...erpConfig, sync_frequency_minutes: Number(e.target.value) })}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:bg-white focus:border-teal-500 cursor-pointer"
              >
                <option value={5}>Every 5 Minutes (Real-Time High Surge Mode)</option>
                <option value={15}>Every 15 Minutes (Recommended Standard)</option>
                <option value={30}>Every 30 Minutes</option>
                <option value={60}>Hourly Batch Sync</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-200">
            <div className="text-[11px] text-slate-500">
              Last Sync: <strong className="text-slate-800 font-mono">{erpConfig.last_sync_time ? new Date(erpConfig.last_sync_time).toLocaleTimeString() : 'Never'}</strong>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handleSaveErpConfig}
                disabled={savingErp}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl border border-slate-300 transition cursor-pointer"
              >
                {savingErp ? 'Saving...' : 'Save Configuration'}
              </button>

              <button
                onClick={handleTriggerErpSync}
                disabled={syncingErp}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl transition shadow-md cursor-pointer flex items-center space-x-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncingErp ? 'animate-spin' : ''}`} />
                <span>{syncingErp ? 'Syncing ERP...' : 'Test & Trigger Live ERP Sync'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: STANDARDIZED SCHEMA & MANUAL DASHBOARD ── */}
      {activeTab === 'standardized' && (
        <div className="bg-white border border-slate-200 p-6 rounded-2xl space-y-4 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center">
                <Table className="w-4 h-4 mr-2 text-teal-600" />
                Standardized Resource Inventory & Freshness Dashboard
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Unified hospital resource table standardized across FHIR, Epic, Cerner, Excel imports, and manual overrides.
              </p>
            </div>

            <button
              onClick={loadIntegrationData}
              disabled={loadingRecords}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition border border-slate-300 flex items-center space-x-1 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingRecords ? 'animate-spin' : ''}`} />
              <span>{loadingRecords ? 'Loading...' : 'Refresh Records'}</span>
            </button>
          </div>

          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-bold sticky top-0">
                <tr>
                  <th className="px-4 py-3 rounded-l-lg">ID</th>
                  <th className="px-4 py-3">Resource Type</th>
                  <th className="px-4 py-3">Resource Name</th>
                  <th className="px-4 py-3 text-right">Total Capacity</th>
                  <th className="px-4 py-3 text-right">Available Quantity</th>
                  <th className="px-4 py-3">Data Source</th>
                  <th className="px-4 py-3">Freshness</th>
                  <th className="px-4 py-3 text-right rounded-r-lg">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono">
                {records.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 font-bold text-slate-500">#{rec.id}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{rec.resource_type}</td>
                    <td className="px-4 py-3 font-bold text-slate-900">{rec.resource_name}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">{rec.total_capacity}</td>
                    <td className="px-4 py-3 text-right font-black text-teal-700">{rec.available_quantity}</td>
                    <td className="px-4 py-3">{renderSourceBadge(rec.data_source)}</td>
                    <td className="px-4 py-3">{renderFreshnessBadge(rec.freshness_status)}</td>
                    <td className="px-4 py-3 text-right font-sans">
                      <button
                        onClick={() => {
                          const newTot = prompt(`Enter new TOTAL capacity for ${rec.resource_name}:`, String(rec.total_capacity));
                          if (newTot === null) return;
                          const newAvail = prompt(`Enter new AVAILABLE quantity for ${rec.resource_name}:`, String(rec.available_quantity));
                          if (newAvail === null) return;
                          handleInlineSaveRecord(rec, parseInt(newTot) || 0, parseInt(newAvail) || 0);
                        }}
                        className="px-2.5 py-1 bg-teal-50 hover:bg-teal-100 text-teal-800 font-bold text-[10px] rounded-lg border border-teal-200 transition cursor-pointer"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 4: IMPORT LOGS & AUDIT TRAIL ── */}
      {activeTab === 'logs' && (
        <div className="bg-white border border-slate-200 p-6 rounded-2xl space-y-4 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 flex items-center">
            <FileText className="w-4 h-4 mr-2 text-teal-600" />
            File Import & ERP Batch Execution Logs
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-bold">
                <tr>
                  <th className="px-4 py-3 rounded-l-lg">Batch ID</th>
                  <th className="px-4 py-3">File / Source</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 text-right">Total Rows</th>
                  <th className="px-4 py-3 text-right">Imported</th>
                  <th className="px-4 py-3 text-right">Skipped / Errors</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3 rounded-r-lg">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono">
                {importLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-bold text-amber-700">#{log.id}</td>
                    <td className="px-4 py-3 font-bold text-slate-900">{log.file_name}</td>
                    <td className="px-4 py-3 font-semibold text-slate-700">{log.file_type}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">{log.total_rows}</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-700">{log.imported_rows}</td>
                    <td className="px-4 py-3 text-right font-bold text-rose-700">{log.error_count}</td>
                    <td className="px-4 py-3 font-sans text-slate-600">{log.imported_by}</td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-[10px]">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {/* ── TAB 5: AI MEDICINE PLANNER ── */}
      {activeTab === 'planner' && (
        <div className="bg-white border border-slate-200 p-6 rounded-2xl space-y-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center">
                <FlaskConical className="w-4 h-4 mr-2 text-amber-500" />
                AI Medicine & Supply Shortage Planner
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Powered by the shared inventory database. Every import, ERP sync, or manual update feeds here automatically.
              </p>
            </div>
            <button
              onClick={async () => {
                setPlannerLoading(true);
                try {
                  const data = await api.getAIInventoryPlanner(hospital.id, 40.0, 65.0);
                  setPlannerData(data);
                } catch(e) { console.error(e); }
                finally { setPlannerLoading(false); }
              }}
              disabled={plannerLoading}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition border border-slate-300 flex items-center space-x-1 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${plannerLoading ? 'animate-spin' : ''}`} />
              <span>{plannerLoading ? 'Loading...' : 'Refresh Planner'}</span>
            </button>
          </div>

          {plannerLoading && (
            <div className="p-8 text-center text-slate-500 text-xs">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />
              Computing AI shortage plan from live database...
            </div>
          )}

          {!plannerLoading && plannerData?.data_source_notice && (
            <div className="flex items-start space-x-3 p-4 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold mb-0.5">Demo Data Notice</p>
                <p>{plannerData.data_source_notice}</p>
                <p className="mt-1 text-amber-700">Import Excel/CSV above or trigger an ERP sync to replace demo data.</p>
              </div>
            </div>
          )}

          {!plannerLoading && plannerData && (
            <>
              {/* Summary KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'AI Surge Patients (24h)', value: `+${Math.round(plannerData.additional_patients_24h)}`, cls: 'text-rose-700' },
                  { label: 'High-Priority Shortages', value: plannerData.stock_recommendations.filter(r => r.priority === 'High').length, cls: 'text-rose-700' },
                  { label: 'Items Tracked', value: plannerData.inventory_items.length, cls: 'text-teal-700' },
                  { label: 'Real-Source Items', value: plannerData.inventory_items.filter((i: any) => !i.is_demo_data).length, cls: plannerData.has_real_data ? 'text-emerald-700' : 'text-slate-500' },
                ].map(k => (
                  <div key={k.label} className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{k.label}</p>
                    <p className={`text-xl font-black mt-1 ${k.cls}`}>{k.value}</p>
                  </div>
                ))}
              </div>

              {/* Shortage Table */}
              <div className="overflow-x-auto max-h-[480px]">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-bold sticky top-0">
                    <tr>
                      <th className="px-3 py-2 rounded-l-lg">Item</th>
                      <th className="px-3 py-2">Category</th>
                      <th className="px-3 py-2 text-right">Usable</th>
                      <th className="px-3 py-2 text-right">Incoming</th>
                      <th className="px-3 py-2 text-right">Surge Need</th>
                      <th className="px-3 py-2 text-right">Shortage</th>
                      <th className="px-3 py-2">Priority</th>
                      <th className="px-3 py-2">Freshness</th>
                      <th className="px-3 py-2 rounded-r-lg">Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-mono">
                    {plannerData.stock_recommendations.map((rec: any, i: number) => (
                      <tr key={i} className={`hover:bg-slate-50 transition ${rec.shortage_quantity > 0 ? 'bg-rose-50/40' : ''}`}>
                        <td className="px-3 py-2 font-bold text-slate-900 font-sans">
                          <div className="flex items-center gap-1.5">
                            {rec.item_name}
                            {rec.is_demo_data && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold border bg-slate-100 text-slate-400 border-slate-200 flex items-center gap-0.5">
                                <Info className="w-2 h-2" /> DEMO
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 font-sans text-slate-600">{rec.category}</td>
                        <td className="px-3 py-2 text-right font-bold text-teal-700">{rec.current_usable_stock} {rec.unit}</td>
                        <td className="px-3 py-2 text-right text-slate-600">{rec.confirmed_incoming_stock} {rec.unit}</td>
                        <td className="px-3 py-2 text-right font-semibold text-amber-700">{rec.forecast_consumption} {rec.unit}</td>
                        <td className="px-3 py-2 text-right font-black">
                          {rec.shortage_quantity > 0 ? (
                            <span className="text-rose-600">+{rec.shortage_quantity} {rec.unit}</span>
                          ) : (
                            <span className="text-emerald-600">None</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            rec.priority === 'High' ? 'bg-rose-100 text-rose-800 border-rose-300'
                            : rec.priority === 'Medium' ? 'bg-amber-100 text-amber-900 border-amber-300'
                            : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          }`}>{rec.priority}</span>
                        </td>
                        <td className="px-3 py-2">
                          {(() => {
                            const cfg: Record<string, {label: string; cls: string}> = {
                              LIVE:   { label: 'LIVE',   cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
                              RECENT: { label: 'RECENT', cls: 'bg-sky-100 text-sky-800 border-sky-300' },
                              STALE:  { label: 'STALE',  cls: 'bg-amber-100 text-amber-900 border-amber-300' },
                              MANUAL: { label: 'MANUAL', cls: 'bg-violet-100 text-violet-800 border-violet-300' },
                            };
                            const c = cfg[rec.freshness_status || 'STALE'] ?? cfg.STALE;
                            return <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${c.cls}`}>{c.label}</span>;
                          })()}
                        </td>
                        <td className="px-3 py-2 text-[10px] font-mono text-slate-500">
                          {rec.data_source === 'SEED_DATA' ? 'Seed' : rec.data_source?.replace('ERP_', '') || 'Manual'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {!plannerLoading && !plannerData && (
            <div className="p-8 text-center text-slate-400 text-xs">
              Click "Refresh Planner" to load the AI shortage analysis from the shared database.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
