'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import {
  TIME_RANGE_OPTIONS,
  parseDetails,
  parseCustomDimensions,
  formatTimestamp,
  formatTimestampFull,
  formatDuration,
  isFailure,
  severityColor,
  severityLabel,
  getRowInlineStyle,
  getPrimaryDisplay,
  parseRows,
  buildExplorerKql,
  buildExplorerPrompt,
  buildRowPrompt,
} from '@/lib/utils';
import type { AppInsightsEnvironment, RawRow } from '@/types';
import { AiModal } from '@/components/AiModal';
import { StackTrace } from '@/components/StackTrace';

interface RenderItem {
  groupHeader: string | null;
  isCollapsed: boolean;
  groupCount: number;
  row: RawRow | null;
}

interface TopProblem {
  key: string;
  itemType: string;
  count: number;
  lastSeen: string;
}

function getGroupKey(row: RawRow, groupBy: string): string {
  switch (groupBy) {
    case 'itemType':      return row.itemType;
    case 'cloudRoleName': return row.cloudRoleName;
    case 'severityLevel': return row.severityLevel
      ? `${row.severityLevel} (${severityLabel(row.severityLevel)})`
      : '';
    case 'resultCode':    return row.resultCode;
    case 'type':          return row.type;
    default:              return '';
  }
}

export default function ExplorerPage() {
  const [environments, setEnvironments] = useState<AppInsightsEnvironment[]>([]);
  const [selectedEnvironment, setSelectedEnvironment] = useState('');
  const [selectedTimeRange, setSelectedTimeRange] = useState('1h');
  const [takeCount, setTakeCount] = useState(500);
  const [problemsOnly, setProblemsOnly] = useState(true);
  const [correlationInput, setCorrelationInput] = useState('');
  const [activeCorrelationId, setActiveCorrelationId] = useState<string | null>(null);
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [executedAt, setExecutedAt] = useState('');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [copiedRow, setCopiedRow] = useState<number | null>(null);

  // Filters
  const [textFilter, setTextFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('All');
  const [successFilter, setSuccessFilter] = useState('All');
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set());
  const [groupBy, setGroupBy] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [ignoredPatterns, setIgnoredPatterns] = useState<string[]>([]);

  const ignoreRow = (row: RawRow) => {
    const pattern = row.name || row.message || row.type || row.outerMessage;
    if (pattern && !ignoredPatterns.includes(pattern))
      setIgnoredPatterns(prev => [...prev, pattern]);
  };
  const removeIgnored = (pattern: string) =>
    setIgnoredPatterns(prev => prev.filter(p => p !== pattern));

  // AI
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  const [analysisText, setAnalysisText] = useState('');
  const [analysisError, setAnalysisError] = useState('');

  // Top problems
  const [topProblemSort, setTopProblemSort] = useState<'count' | 'name'>('count');
  const [topProblemsExpanded, setTopProblemsExpanded] = useState(true);

  useEffect(() => {
    api.getEnvironments().then(setEnvironments).catch(() => {});
  }, []);

  const canFetch = !isLoading && !!selectedEnvironment;

  const filteredRows = rawRows.filter(r => {
    if (textFilter) {
      const tf = textFilter.toLowerCase();
      if (
        !r.name.toLowerCase().includes(tf) &&
        !r.message.toLowerCase().includes(tf) &&
        !r.type.toLowerCase().includes(tf) &&
        !r.outerMessage.toLowerCase().includes(tf)
      ) return false;
    }
    if (severityFilter !== 'All' && r.severityLevel !== severityFilter) return false;
    if (successFilter === 'yes' && isFailure(r)) return false;
    if (successFilter === 'no' && !isFailure(r)) return false;
    if (selectedRoles.size > 0 && !selectedRoles.has(r.cloudRoleName)) return false;
    if (ignoredPatterns.some(p =>
      r.name === p || r.message === p || r.type === p || r.outerMessage === p
    )) return false;
    return true;
  });

  const itemTypeCounts = filteredRows.reduce<Record<string, number>>((acc, r) => {
    acc[r.itemType] = (acc[r.itemType] ?? 0) + 1;
    return acc;
  }, {});

  const allRoles = [...new Set(rawRows.map(r => r.cloudRoleName).filter(Boolean))].sort();

  function getRenderList(): RenderItem[] {
    if (!groupBy) {
      return filteredRows.map(r => ({ groupHeader: null, isCollapsed: false, groupCount: 0, row: r }));
    }
    const groups = new Map<string, RawRow[]>();
    for (const r of filteredRows) {
      const key = getGroupKey(r, groupBy);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    const sortedKeys = [...groups.keys()].sort();
    const result: RenderItem[] = [];
    for (const key of sortedKeys) {
      const rows = groups.get(key)!;
      const collapsed = collapsedGroups.has(key);
      result.push({ groupHeader: key, isCollapsed: collapsed, groupCount: rows.length, row: null });
      if (!collapsed) {
        for (const r of rows) result.push({ groupHeader: null, isCollapsed: false, groupCount: 0, row: r });
      }
    }
    return result;
  }

  function getTopProblems(): TopProblem[] {
    if (rawRows.length === 0) return [];
    type Candidate = { key: string; itemType: string; row: RawRow };
    const candidates: Candidate[] = [];
    for (const r of filteredRows) {
      const it = r.itemType?.toLowerCase();
      let key: string | null = null;
      if (it === 'exception') {
        key = r.type || r.outerMessage;
      } else if (it === 'request' && isFailure(r)) {
        key = r.name;
      } else if (it === 'dependency' && isFailure(r)) {
        key = r.name;
      } else if (it === 'trace') {
        const sev = parseInt(r.severityLevel, 10);
        if (!isNaN(sev) && sev >= 2) key = r.message.slice(0, 80);
      }
      if (key) candidates.push({ key, itemType: it ?? '', row: r });
    }
    const groupMap = new Map<string, { key: string; itemType: string; count: number; lastSeen: string }>();
    for (const c of candidates) {
      const mapKey = `${c.key}|${c.itemType}`;
      const existing = groupMap.get(mapKey);
      if (existing) {
        existing.count++;
        if (c.row.timestamp > existing.lastSeen) existing.lastSeen = c.row.timestamp;
      } else {
        groupMap.set(mapKey, { key: c.key, itemType: c.itemType, count: 1, lastSeen: c.row.timestamp });
      }
    }
    let problems = [...groupMap.values()].map(v => ({
      key: v.key,
      itemType: v.itemType,
      count: v.count,
      lastSeen: formatTimestamp(v.lastSeen),
    }));
    if (topProblemSort === 'name') {
      problems = problems.sort((a, b) => a.key.localeCompare(b.key));
    } else {
      problems = problems.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
    }
    return problems.slice(0, 15);
  }

  async function fetchLogs(overrideKql?: string) {
    if (!canFetch) return;
    setIsLoading(true);
    setErrorMessage('');
    setExpandedRow(null);
    setRawRows([]);
    const kql = overrideKql ?? buildExplorerKql(
      selectedTimeRange,
      takeCount,
      problemsOnly,
      activeCorrelationId ?? undefined,
    );
    try {
      const result = await api.runQuery({ environmentName: selectedEnvironment, kql });
      setRawRows(parseRows(result));
      setExecutedAt(result.executedAt);
    } catch (err: any) {
      setErrorMessage(`Error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }

  async function searchCorrelation() {
    if (!correlationInput.trim()) return;
    setActiveCorrelationId(correlationInput.trim());
    await fetchLogs(buildExplorerKql(selectedTimeRange, takeCount, problemsOnly, correlationInput.trim()));
  }

  function clearCorrelation() {
    setActiveCorrelationId(null);
    setCorrelationInput('');
    setRawRows([]);
    setExpandedRow(null);
  }

  async function analyzeWithAI(singleRow: RawRow | null) {
    setIsAnalyzing(true);
    setAnalysisText('');
    setAnalysisError('');
    setShowAnalysisModal(true);
    const rows = singleRow ? [singleRow] : filteredRows;
    const prompt = singleRow
      ? 'You are a senior .NET / Azure engineer. Analyze this Application Insights telemetry row:\n\n' + buildRowPrompt(singleRow)
      : buildExplorerPrompt(rows, selectedEnvironment, selectedTimeRange, activeCorrelationId, executedAt);
    try {
      const result = await api.analyze({ prompt });
      setAnalysisText(result.analysis);
    } catch (err: any) {
      setAnalysisError(`Analysis failed: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  }

  const [copiedPrompt, setCopiedPrompt] = useState(false);
  async function copyAnalysisPrompt() {
    const prompt = buildExplorerPrompt(filteredRows, selectedEnvironment, selectedTimeRange, activeCorrelationId, executedAt);
    await navigator.clipboard.writeText(prompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  }

  async function copyRow(row: RawRow) {
    const text = buildRowPrompt(row);
    await navigator.clipboard.writeText(text);
    setCopiedRow(row.originalIndex);
    setTimeout(() => setCopiedRow(null), 2000);
  }

  function setCorrelationSearch(operationId: string) {
    setCorrelationInput(operationId);
    setActiveCorrelationId(operationId);
    fetchLogs(buildExplorerKql(selectedTimeRange, takeCount, problemsOnly, operationId));
  }

  function toggleGroup(key: string) {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function clearFilters() {
    setTextFilter('');
    setSeverityFilter('All');
    setSuccessFilter('All');
    setSelectedRoles(new Set());
    setGroupBy('');
    setCollapsedGroups(new Set());
  }

  const hasActiveFilter = textFilter || severityFilter !== 'All' || successFilter !== 'All' || selectedRoles.size > 0 || groupBy;

  const renderList = getRenderList();
  const topProblems = getTopProblems();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1" style={{ color: '#002855' }}>Diagnostic Explorer</h1>
      <p style={{ color: '#757575', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
        Raw telemetry timeline across requests, traces, exceptions, and dependencies.
      </p>

      {/* Controls */}
      <div className="mb-4 p-4 border-b" style={{ backgroundColor: '#F8FAFC', borderColor: '#D3D5D9', display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label className="block mb-1" style={{ color: '#002855', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2px' }}>Environment</label>
          <select
            value={selectedEnvironment}
            onChange={e => setSelectedEnvironment(e.target.value)}
            style={{ minWidth: '280px', height: '40px', padding: '0 0.75rem', border: '1px solid #D3D5D9', fontSize: '0.875rem', color: '#273139', backgroundColor: '#fff', outline: 'none', borderRadius: 0 }}
            onFocus={e => (e.target.style.borderColor = '#5E9FE8')}
            onBlur={e => (e.target.style.borderColor = '#D3D5D9')}
          >
            <option value="">-- Select Environment --</option>
            {environments.map(env => (
              <option key={env.name} value={env.name}>{env.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block mb-1" style={{ color: '#002855', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2px' }}>Time Range</label>
          <select
            value={selectedTimeRange}
            onChange={e => setSelectedTimeRange(e.target.value)}
            style={{ minWidth: '120px', height: '40px', padding: '0 0.75rem', border: '1px solid #D3D5D9', fontSize: '0.875rem', color: '#273139', backgroundColor: '#fff', outline: 'none', borderRadius: 0 }}
            onFocus={e => (e.target.style.borderColor = '#5E9FE8')}
            onBlur={e => (e.target.style.borderColor = '#D3D5D9')}
          >
            {TIME_RANGE_OPTIONS.map(tr => (
              <option key={tr.ago} value={tr.ago}>{tr.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block mb-1" style={{ color: '#002855', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2px' }}>Take</label>
          <select
            value={takeCount}
            onChange={e => setTakeCount(Number(e.target.value))}
            style={{ minWidth: '90px', height: '40px', padding: '0 0.75rem', border: '1px solid #D3D5D9', fontSize: '0.875rem', color: '#273139', backgroundColor: '#fff', outline: 'none', borderRadius: 0 }}
            onFocus={e => (e.target.style.borderColor = '#5E9FE8')}
            onBlur={e => (e.target.style.borderColor = '#D3D5D9')}
          >
            <option value={100}>100</option>
            <option value={500}>500</option>
            <option value={1000}>1000</option>
            <option value={5000}>5000</option>
          </select>
        </div>
        <button
          onClick={() => fetchLogs()}
          disabled={!canFetch}
          title="Fetch telemetry logs from App Insights"
          style={{ height: '40px', padding: '0 1.25rem', cursor: canFetch ? 'pointer' : 'default', backgroundColor: '#002f6c', color: '#fff', border: 'none', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', borderRadius: 0, opacity: canFetch ? 1 : 0.5 }}
        >
          {isLoading ? 'Loading...' : 'Fetch Logs'}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <input
            type="checkbox"
            id="problemsOnly"
            checked={problemsOnly}
            onChange={e => setProblemsOnly(e.target.checked)}
          />
          <label htmlFor="problemsOnly" style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#002855', letterSpacing: '0.2px' }}>Problems only</label>
        </div>
      </div>

      {/* Correlation search */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <input
          value={correlationInput}
          onChange={e => setCorrelationInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') searchCorrelation(); }}
          placeholder="Filter by operation_Id, session_Id, or user_Id..."
          style={{ minWidth: '400px', height: '40px', padding: '0 0.75rem', border: '1px solid #D3D5D9', fontFamily: 'monospace', fontSize: '0.85rem', outline: 'none', borderRadius: 0 }}
          onFocus={e => (e.target.style.borderColor = '#5E9FE8')}
          onBlur={e => (e.target.style.borderColor = '#D3D5D9')}
        />
        <button
          onClick={searchCorrelation}
          disabled={!correlationInput.trim() || isLoading}
          title="Filter results by this operation ID, session ID, or user ID"
          style={{ height: '40px', padding: '0 1rem', cursor: 'pointer', backgroundColor: '#002f6c', color: '#fff', border: 'none', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', borderRadius: 0, opacity: (!correlationInput.trim() || isLoading) ? 0.5 : 1 }}
        >
          Search
        </button>
        {activeCorrelationId && (
          <>
            <button onClick={clearCorrelation} title="Clear the correlation filter and reset results" style={{ height: '40px', padding: '0 1rem', cursor: 'pointer', backgroundColor: '#fff', color: '#002f6c', border: '1px solid #002f6c', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', borderRadius: 0 }}>Clear</button>
            <span style={{ color: '#273139', fontSize: '0.85rem' }}>
              Correlation: <strong style={{ fontFamily: 'monospace' }}>{activeCorrelationId}</strong>
            </span>
          </>
        )}
      </div>

      {/* Error */}
      {errorMessage && (
        <div style={{ backgroundColor: '#fff0f0', border: '1px solid rgba(208,2,27,0.3)', padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.875rem', color: '#D0021B' }}>
          {errorMessage}
        </div>
      )}

      {isLoading && <p style={{ color: '#757575' }}>Loading telemetry...</p>}

      {!isLoading && rawRows.length > 0 && (
        <>
          {/* Stats bar */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem', padding: '0.6rem 0.8rem', backgroundColor: '#F8FAFC', border: '1px solid #D3D5D9' }}>
            <strong style={{ fontSize: '0.85rem', color: '#002855' }}>{filteredRows.length} rows</strong>
            {Object.entries(itemTypeCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([type, count]) => {
                const it = type.toLowerCase();
                let badgeStyle: React.CSSProperties = { padding: '0.2rem 0.6rem', fontSize: '0.75rem', fontWeight: 600, border: '1px solid', borderRadius: 0 };
                if (it === 'exception') badgeStyle = { ...badgeStyle, backgroundColor: 'rgba(208,2,27,0.1)', color: '#D0021B', borderColor: 'rgba(208,2,27,0.2)' };
                else if (it === 'request') badgeStyle = { ...badgeStyle, backgroundColor: '#eff6ff', color: '#002f6c', borderColor: '#bfdbfe' };
                else if (it === 'dependency') badgeStyle = { ...badgeStyle, backgroundColor: '#fff7ed', color: '#FF7F32', borderColor: '#fed7aa' };
                else badgeStyle = { ...badgeStyle, backgroundColor: '#f3f4f6', color: '#757575', borderColor: '#e5e7eb' };
                return (
                  <span key={type} style={badgeStyle}>
                    {type}: {count}
                  </span>
                );
              })}
            <span style={{ color: '#757575', fontSize: '0.75rem', marginLeft: 'auto' }}>
              {rawRows.length} total &mdash; {formatTimestampFull(executedAt)}
            </span>
          </div>

          {/* Filters bar */}
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '0.75rem', padding: '0.75rem', backgroundColor: '#fff', border: '1px solid #D3D5D9' }}>
            <div>
              <label className="block mb-1" style={{ color: '#002855', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2px' }}>Search</label>
              <input
                value={textFilter}
                onChange={e => setTextFilter(e.target.value)}
                placeholder="name, message, type..."
                style={{ minWidth: '220px', height: '36px', padding: '0 0.5rem', fontSize: '0.85rem', border: '1px solid #D3D5D9', outline: 'none', borderRadius: 0 }}
                onFocus={e => (e.target.style.borderColor = '#5E9FE8')}
                onBlur={e => (e.target.style.borderColor = '#D3D5D9')}
              />
            </div>
            <div>
              <label className="block mb-1" style={{ color: '#002855', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2px' }}>Severity</label>
              <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)} style={{ height: '36px', padding: '0 0.5rem', fontSize: '0.85rem', border: '1px solid #D3D5D9', outline: 'none', borderRadius: 0, color: '#273139', backgroundColor: '#fff' }}>
                <option value="All">All severities</option>
                <option value="0">Verbose (0)</option>
                <option value="1">Information (1)</option>
                <option value="2">Warning (2)</option>
                <option value="3">Error (3)</option>
                <option value="4">Critical (4)</option>
              </select>
            </div>
            <div>
              <label className="block mb-1" style={{ color: '#002855', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2px' }}>Success</label>
              <select value={successFilter} onChange={e => setSuccessFilter(e.target.value)} style={{ height: '36px', padding: '0 0.5rem', fontSize: '0.85rem', border: '1px solid #D3D5D9', outline: 'none', borderRadius: 0, color: '#273139', backgroundColor: '#fff' }}>
                <option value="All">All</option>
                <option value="yes">Success only</option>
                <option value="no">Failed only</option>
              </select>
            </div>
            {allRoles.length > 1 && (
              <div>
                <label className="block mb-1" style={{ color: '#002855', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2px' }}>Role</label>
                <select
                  multiple
                  onChange={e => {
                    const vals = [...e.target.selectedOptions].map(o => o.value);
                    setSelectedRoles(new Set(vals));
                  }}
                  style={{ height: '36px', padding: '0 0.5rem', fontSize: '0.85rem', border: '1px solid #D3D5D9', outline: 'none', borderRadius: 0, minWidth: '140px', maxHeight: '72px', color: '#273139', backgroundColor: '#fff' }}
                >
                  {allRoles.map(role => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block mb-1" style={{ color: '#002855', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2px' }}>Group by</label>
              <select value={groupBy} onChange={e => setGroupBy(e.target.value)} style={{ height: '36px', padding: '0 0.5rem', fontSize: '0.85rem', border: '1px solid #D3D5D9', outline: 'none', borderRadius: 0, color: '#273139', backgroundColor: '#fff' }}>
                <option value="">None</option>
                <option value="itemType">Item Type</option>
                <option value="cloudRoleName">Role Name</option>
                <option value="severityLevel">Severity</option>
                <option value="resultCode">Result Code</option>
                <option value="type">Exception Type</option>
              </select>
            </div>
            {hasActiveFilter && (
              <button
                onClick={clearFilters}
                title="Reset all filters"
                style={{ height: '36px', padding: '0 0.7rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', cursor: 'pointer', alignSelf: 'flex-end', backgroundColor: '#fff', color: '#002f6c', border: '1px solid #002f6c', borderRadius: 0 }}
              >
                Clear Filters
              </button>
            )}
          </div>

          {/* Hidden patterns */}
          {ignoredPatterns.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: '#757575', letterSpacing: '0.5px' }}>Hidden:</span>
              {ignoredPatterns.map(p => (
                <span key={p} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', backgroundColor: '#f3f4f6', border: '1px solid #D3D5D9', padding: '0.1rem 0.5rem', fontSize: '0.75rem', color: '#273139' }}>
                  <span style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p}</span>
                  <button onClick={() => removeIgnored(p)} title="Remove this pattern from the hidden list" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#757575', fontWeight: 700, fontSize: '0.85rem', lineHeight: 1, padding: 0 }}>×</button>
                </span>
              ))}
              <button onClick={() => setIgnoredPatterns([])} title="Remove all hidden patterns and show all rows" style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', cursor: 'pointer', color: '#D0021B', background: 'none', border: 'none', padding: 0 }}>
                Clear all
              </button>
            </div>
          )}

          {/* AI button */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <button
              onClick={() => analyzeWithAI(null)}
              disabled={isAnalyzing}
              title="Send all filtered rows to Claude AI for analysis"
              style={{ height: '36px', padding: '0 0.8rem', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', backgroundColor: '#002f6c', color: '#fff', border: 'none', borderRadius: 0, opacity: isAnalyzing ? 0.6 : 1 }}
            >
              {isAnalyzing ? 'Analyzing...' : 'Analyze with AI'}
            </button>
            <button
              onClick={copyAnalysisPrompt}
              title="Copy the exact text that will be sent to Claude — see what's included before analyzing"
              style={{ height: '36px', padding: '0 0.8rem', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', backgroundColor: '#fff', color: '#002f6c', border: '1px solid #002f6c', borderRadius: 0 }}
            >
              {copiedPrompt ? 'Copied!' : 'Copy Prompt'}
            </button>
          </div>

          {/* Top Problems */}
          <div style={{ border: '1px solid #D3D5D9', marginBottom: '1rem' }}>
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.8rem', backgroundColor: '#F9F9F9', borderBottom: '1px solid #D3D5D9', cursor: 'pointer' }}
              onClick={() => setTopProblemsExpanded(v => !v)}
            >
              <strong style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2px', color: '#002855' }}>{topProblemsExpanded ? '▼' : '▶'} Top Problems</strong>
              <div style={{ display: 'flex', gap: '0.4rem' }} onClick={e => e.stopPropagation()}>
                {(['count', 'name'] as const).map(sort => (
                  <button
                    key={sort}
                    onClick={() => setTopProblemSort(sort)}
                    title={sort === 'count' ? 'Sort problems by count' : 'Sort problems by name'}
                    style={{
                      padding: '0.15rem 0.5rem',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                      borderRadius: 0,
                      backgroundColor: topProblemSort === sort ? '#002f6c' : '#fff',
                      color: topProblemSort === sort ? '#fff' : '#002f6c',
                      border: topProblemSort === sort ? '1px solid #002f6c' : '1px solid #D3D5D9',
                    }}
                  >
                    By {sort.charAt(0).toUpperCase() + sort.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            {topProblemsExpanded && (
              topProblems.length === 0 ? (
                <p style={{ padding: '0.6rem 0.8rem', color: '#757575', fontSize: '0.85rem', margin: 0 }}>No critical problems detected in filtered results.</p>
              ) : (
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.85rem' }}>
                  <tbody>
                    {topProblems.map((problem, i) => {
                      const it = problem.itemType.toLowerCase();
                      let badgeStyle: React.CSSProperties = { padding: '0.15rem 0.5rem', fontSize: '0.75rem', fontWeight: 600, border: '1px solid', borderRadius: 0, whiteSpace: 'nowrap' };
                      if (it === 'exception') badgeStyle = { ...badgeStyle, backgroundColor: 'rgba(208,2,27,0.1)', color: '#D0021B', borderColor: 'rgba(208,2,27,0.2)' };
                      else if (it === 'request') badgeStyle = { ...badgeStyle, backgroundColor: '#eff6ff', color: '#002f6c', borderColor: '#bfdbfe' };
                      else if (it === 'dependency') badgeStyle = { ...badgeStyle, backgroundColor: '#fff7ed', color: '#FF7F32', borderColor: '#fed7aa' };
                      else badgeStyle = { ...badgeStyle, backgroundColor: '#f3f4f6', color: '#757575', borderColor: '#e5e7eb' };
                      return (
                        <tr
                          key={i}
                          style={{ borderTop: '1px solid #f0f0f0', cursor: 'pointer' }}
                          onClick={() => setTextFilter(problem.key)}
                          title="Click to filter table by this problem"
                        >
                          <td style={{ padding: '0.3rem 0.6rem', width: '7rem' }}>
                            <span style={badgeStyle}>{problem.itemType}</span>
                          </td>
                          <td style={{ padding: '0.3rem 0.6rem', maxWidth: '500px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#273139' }} title={problem.key}>
                            {problem.key}
                          </td>
                          <td style={{ padding: '0.3rem 0.8rem', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', width: '4rem', color: '#273139' }}>
                            {problem.count}
                          </td>
                          <td style={{ padding: '0.3rem 0.8rem', color: '#757575', fontSize: '0.75rem', fontFamily: 'monospace', whiteSpace: 'nowrap', width: '10rem' }}>
                            {problem.lastSeen}
                          </td>
                          <td style={{ padding: '0.3rem 0.6rem', width: '5rem' }} onClick={e => e.stopPropagation()}>
                            <button onClick={() => setTextFilter(problem.key)} style={{ padding: '0.15rem 0.4rem', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', cursor: 'pointer', backgroundColor: '#002f6c', color: '#fff', border: 'none', borderRadius: 0 }}>
                              Filter
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )
            )}
          </div>

          {/* Results table */}
          <div style={{ overflowX: 'auto', border: '1px solid #D3D5D9' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#F9F9F9' }}>
                  <th style={{ padding: '0.75rem 0.4rem', width: '2rem', borderBottom: '1px solid #D3D5D9' }}></th>
                  <th style={{ padding: '0.75rem 0.8rem', textAlign: 'left', whiteSpace: 'nowrap', color: '#002855', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2px', borderBottom: '1px solid #D3D5D9' }}>Timestamp</th>
                  <th style={{ padding: '0.75rem 0.8rem', textAlign: 'left', whiteSpace: 'nowrap', color: '#002855', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2px', borderBottom: '1px solid #D3D5D9' }}>Type</th>
                  <th style={{ padding: '0.75rem 0.8rem', textAlign: 'left', color: '#002855', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2px', borderBottom: '1px solid #D3D5D9' }}>Name / Message</th>
                  <th style={{ padding: '0.75rem 0.8rem', textAlign: 'left', color: '#002855', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2px', borderBottom: '1px solid #D3D5D9' }}>Exception / Dep Type</th>
                  <th style={{ padding: '0.75rem 0.8rem', textAlign: 'right', whiteSpace: 'nowrap', color: '#002855', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2px', borderBottom: '1px solid #D3D5D9' }}>Duration</th>
                  <th style={{ padding: '0.75rem 0.8rem', textAlign: 'left', whiteSpace: 'nowrap', color: '#002855', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2px', borderBottom: '1px solid #D3D5D9' }}>Result</th>
                  <th style={{ padding: '0.75rem 0.8rem', textAlign: 'left', whiteSpace: 'nowrap', color: '#002855', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2px', borderBottom: '1px solid #D3D5D9' }}>Sev</th>
                  <th style={{ padding: '0.75rem 0.8rem', textAlign: 'left', whiteSpace: 'nowrap', color: '#002855', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2px', borderBottom: '1px solid #D3D5D9' }}>Role</th>
                  <th style={{ padding: '0.75rem 0.4rem', width: '6rem', borderBottom: '1px solid #D3D5D9' }}></th>
                </tr>
              </thead>
              <tbody>
                {renderList.map((item, i) => {
                  if (item.groupHeader !== null) {
                    return (
                      <tr
                        key={`g-${i}`}
                        style={{ backgroundColor: '#F7F7F7', cursor: 'pointer' }}
                        onClick={() => toggleGroup(item.groupHeader!)}
                      >
                        <td colSpan={10} style={{ padding: '0.5rem 0.8rem', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.2px', color: '#002855' }}>
                          {item.isCollapsed ? '▶' : '▼'}
                          {' '}{item.groupHeader || '(empty)'}
                          <span style={{ fontWeight: 'normal', color: '#757575' }}> — {item.groupCount} rows</span>
                        </td>
                      </tr>
                    );
                  }

                  const row = item.row!;
                  const isExpanded = expandedRow === row.originalIndex;
                  const indent = activeCorrelationId && row.operationParentId ? 'paddingLeft: 1.5rem' : '';
                  const rowBg = isExpanded ? 'background: #e8f0fe;' : getRowInlineStyle(row.itemType);
                  const parsedDet = isExpanded ? parseDetails(row.details) : null;
                  const dims = isExpanded ? parseCustomDimensions(row.customDimensions) : null;

                  const rowBadgeStyle = (itemType: string): React.CSSProperties => {
                    const it = itemType.toLowerCase();
                    let s: React.CSSProperties = { padding: '0.15rem 0.5rem', fontSize: '0.75rem', fontWeight: 600, border: '1px solid', borderRadius: 0, whiteSpace: 'nowrap' };
                    if (it === 'exception') return { ...s, backgroundColor: 'rgba(208,2,27,0.1)', color: '#D0021B', borderColor: 'rgba(208,2,27,0.2)' };
                    if (it === 'request') return { ...s, backgroundColor: '#eff6ff', color: '#002f6c', borderColor: '#bfdbfe' };
                    if (it === 'dependency') return { ...s, backgroundColor: '#fff7ed', color: '#FF7F32', borderColor: '#fed7aa' };
                    return { ...s, backgroundColor: '#f3f4f6', color: '#757575', borderColor: '#e5e7eb' };
                  };

                  return (
                    <React.Fragment key={`frag-${row.originalIndex}`}>
                      <tr
                        style={{ borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }}
                        className="hover:bg-[#E8EFF7]/50"
                        onClick={() => setExpandedRow(isExpanded ? null : row.originalIndex)}
                      >
                        <td style={{ padding: '0.4rem 0.4rem', textAlign: 'center', color: '#757575', fontSize: '0.75rem' }}>
                          {isExpanded ? '▼' : '▶'}
                        </td>
                        <td style={{ padding: '0.4rem 0.8rem', whiteSpace: 'nowrap', fontSize: '0.78rem', color: '#757575', fontFamily: 'monospace' }}>
                          {formatTimestamp(row.timestamp)}
                        </td>
                        <td style={{ padding: '0.4rem 0.8rem' }}>
                          <span style={rowBadgeStyle(row.itemType)}>
                            {row.itemType}
                          </span>
                        </td>
                        <td
                          style={{ padding: '0.4rem 0.8rem', maxWidth: '380px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#273139', fontSize: '0.875rem', ...(activeCorrelationId && row.operationParentId ? { paddingLeft: '1.5rem' } : {}) }}
                          title={getPrimaryDisplay(row)}
                        >
                          {getPrimaryDisplay(row)}
                        </td>
                        <td style={{ padding: '0.4rem 0.8rem', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#D0021B', fontSize: '0.82rem' }} title={row.type}>
                          {row.type}
                        </td>
                        <td style={{ padding: '0.4rem 0.8rem', textAlign: 'right', whiteSpace: 'nowrap', color: '#757575', fontSize: '0.82rem' }}>
                          {formatDuration(row.duration)}
                        </td>
                        <td style={{ padding: '0.4rem 0.8rem', whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                          {row.resultCode ? (
                            <span style={{ color: isFailure(row) ? '#D0021B' : '#5AC16E', fontWeight: isFailure(row) ? 600 : undefined }}>
                              {row.resultCode}
                            </span>
                          ) : row.success ? (
                            <span style={{ color: isFailure(row) ? '#D0021B' : '#5AC16E' }}>
                              {isFailure(row) ? '✗' : '✓'}
                            </span>
                          ) : null}
                        </td>
                        <td style={{ padding: '0.4rem 0.8rem', whiteSpace: 'nowrap', fontSize: '0.82rem', color: severityColor(row.severityLevel) }}>
                          {severityLabel(row.severityLevel)}
                        </td>
                        <td style={{ padding: '0.4rem 0.8rem', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.82rem', color: '#757575' }} title={row.cloudRoleName}>
                          {row.cloudRoleName}
                        </td>
                        <td style={{ padding: '0.2rem 0.4rem', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => copyRow(row)}
                            title="Copy this row's diagnostics to clipboard"
                            style={{ padding: '0.15rem 0.5rem', fontSize: '0.7rem', cursor: 'pointer', marginRight: '0.2rem', whiteSpace: 'nowrap', backgroundColor: '#002f6c', color: '#fff', border: 'none', borderRadius: 0, fontWeight: 700, textTransform: 'uppercase' }}
                          >
                            {copiedRow === row.originalIndex ? 'Copied!' : 'Copy'}
                          </button>
                          <button
                            onClick={() => analyzeWithAI(row)}
                            disabled={isAnalyzing}
                            title="Analyze this row with Claude AI"
                            style={{ padding: '0.15rem 0.5rem', fontSize: '0.7rem', cursor: 'pointer', whiteSpace: 'nowrap', backgroundColor: '#002f6c', color: '#fff', border: 'none', borderRadius: 0, fontWeight: 700, textTransform: 'uppercase', opacity: isAnalyzing ? 0.6 : 1 }}
                          >
                            AI
                          </button>
                          <button
                            onClick={() => ignoreRow(row)}
                            title="Hide all rows with this name/message from the results"
                            style={{ padding: '0.15rem 0.5rem', fontSize: '0.7rem', cursor: 'pointer', whiteSpace: 'nowrap', backgroundColor: '#757575', color: '#fff', border: 'none', borderRadius: 0, fontWeight: 700, textTransform: 'uppercase', marginLeft: '0.2rem' }}
                          >
                            Hide
                          </button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr key={`exp-${row.originalIndex}`}>
                          <td colSpan={10} style={{ padding: 0 }}>
                            <div style={{ background: '#1e1e1e', color: '#d4d4d4', padding: '1rem', margin: '0.2rem 0.5rem 0.4rem', borderRadius: '4px', overflowX: 'auto', fontSize: '0.83rem' }}>
                              {row.operationId && (
                                <div style={{ marginBottom: '0.5rem' }}>
                                  <span style={{ color: '#569cd6' }}>operation_Id: </span>
                                  <span style={{ fontFamily: 'monospace', color: '#9cdcfe' }}>{row.operationId}</span>
                                  <button
                                    onClick={() => setCorrelationSearch(row.operationId)}
                                    title="Filter results to this operation ID"
                                    style={{ marginLeft: '0.5rem', padding: '0.1rem 0.4rem', fontSize: '0.75rem', cursor: 'pointer' }}
                                  >
                                    Correlate
                                  </button>
                                </div>
                              )}
                              {row.operationParentId && (
                                <div style={{ marginBottom: '0.5rem' }}>
                                  <span style={{ color: '#569cd6' }}>operation_ParentId: </span>
                                  <span style={{ fontFamily: 'monospace', color: '#9cdcfe' }}>{row.operationParentId}</span>
                                </div>
                              )}
                              {row.cloudRoleInstance && (
                                <div style={{ marginBottom: '0.5rem' }}>
                                  <span style={{ color: '#569cd6' }}>cloud_RoleInstance: </span>
                                  <span style={{ color: '#ce9178' }}>{row.cloudRoleInstance}</span>
                                </div>
                              )}
                              {row.innermostMessage && row.innermostMessage !== row.outerMessage && (
                                <div style={{ marginBottom: '0.75rem' }}>
                                  <div style={{ color: '#569cd6', marginBottom: '0.2rem' }}>innermostMessage:</div>
                                  <div style={{ color: '#ce9178', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{row.innermostMessage}</div>
                                </div>
                              )}
                              {row.outerMessage && (
                                <div style={{ marginBottom: '0.75rem' }}>
                                  <div style={{ color: '#569cd6', marginBottom: '0.2rem' }}>outerMessage:</div>
                                  <div style={{ color: '#ce9178', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{row.outerMessage}</div>
                                </div>
                              )}
                              {row.message && row.itemType?.toLowerCase() !== 'exception' && (
                                <div style={{ marginBottom: '0.75rem' }}>
                                  <div style={{ color: '#569cd6', marginBottom: '0.2rem' }}>message:</div>
                                  <div style={{ color: '#dcdcaa', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{row.message}</div>
                                </div>
                              )}
                              {parsedDet && (
                                <div style={{ marginBottom: '0.75rem' }}>
                                  <div style={{ color: '#569cd6', marginBottom: '0.4rem' }}>stack trace:</div>
                                  <StackTrace entries={parsedDet} />
                                </div>
                              )}
                              {dims && Object.keys(dims).length > 0 && (
                                <div>
                                  <div style={{ color: '#569cd6', marginBottom: '0.4rem' }}>customDimensions:</div>
                                  <table style={{ borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                    <tbody>
                                      {Object.entries(dims).map(([k, v]) => (
                                        <tr key={k}>
                                          <td style={{ padding: '0.1rem 0.8rem 0.1rem 0', color: '#9cdcfe', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{k}</td>
                                          <td style={{ padding: '0.1rem 0', color: '#ce9178', wordBreak: 'break-word' }}>{v}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!isLoading && rawRows.length === 0 && executedAt && (
        <p style={{ color: '#757575', fontSize: '0.875rem' }}>No results. Try a different time range or environment.</p>
      )}

      {showAnalysisModal && (
        <AiModal
          isAnalyzing={isAnalyzing}
          analysisText={analysisText}
          analysisError={analysisError}
          onClose={() => { setShowAnalysisModal(false); setAnalysisText(''); setAnalysisError(''); }}
        />
      )}
    </div>
  );
}
