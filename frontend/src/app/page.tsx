'use client';

import React, { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import {
  TIME_RANGE_OPTIONS,
  substituteTimeRange,
  parseDetails,
  formatTimestampFull,
  buildDrillDownExceptionKql,
  buildDrillDownDependencyKql,
  buildDrillDownCorrelationKql,
  buildDashboardPrompt,
} from '@/lib/utils';
import type { AppInsightsEnvironment, CannedQuery, QueryResult } from '@/types';
import { AiModal } from '@/components/AiModal';
import { StackTrace } from '@/components/StackTrace';

const HIDDEN_DRILLDOWN_COLS = new Set([
  'details', 'outermessage', 'innermostmessage', 'extype', 'exceptionchain',
  'operation_id', 'operation_id1',
]);

function isHiddenCol(col: string): boolean {
  return HIDDEN_DRILLDOWN_COLS.has(col.toLowerCase());
}

function getCorrelationRowBg(row: (string | null)[], columns: string[]): string {
  const ttIdx = columns.findIndex(c => c.toLowerCase() === 'telemetrytype');
  if (ttIdx < 0) return '';
  const tt = row[ttIdx] ?? '';
  switch (tt) {
    case 'Exception':   return 'background: #fff0f0;';
    case 'Dependency':  return 'background: #fff8e6;';
    case 'Request':     return 'background: #f0f4ff;';
    case 'Trace':       return 'background: #f5f5f5;';
    default:            return '';
  }
}

export default function DashboardPage() {
  const [environments, setEnvironments] = useState<AppInsightsEnvironment[]>([]);
  const [cannedQueries, setCannedQueries] = useState<CannedQuery[]>([]);
  const [selectedEnvironment, setSelectedEnvironment] = useState('');
  const [selectedQueryIndex, setSelectedQueryIndex] = useState(-1);
  const [selectedTimeRange, setSelectedTimeRange] = useState('1h');
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [drillDownType, setDrillDownType] = useState<string | null>(null);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [copyButtonText, setCopyButtonText] = useState('Copy Diagnostics');
  const [copiedRow, setCopiedRow] = useState<number | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  const [analysisText, setAnalysisText] = useState('');
  const [analysisError, setAnalysisError] = useState('');

  useEffect(() => {
    async function init() {
      try {
        const [envs, queries] = await Promise.all([api.getEnvironments(), api.getQueries()]);
        setEnvironments(envs);
        setCannedQueries(queries);
      } catch (err: unknown) {
        setErrorMessage(`Failed to load configuration: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    init();
  }, []);

  const timeRangeOption = TIME_RANGE_OPTIONS.find(o => o.ago === selectedTimeRange) ?? TIME_RANGE_OPTIONS[2];
  const canRunQuery = !isLoading && !!selectedEnvironment && selectedQueryIndex >= 0;
  const isDrillDown = drillDownType !== null;
  const isCorrelationDrillDown = drillDownType?.startsWith('op:') ?? false;

  function getColIdx(name: string): number {
    if (!queryResult) return -1;
    return queryResult.columns.findIndex(c => c.toLowerCase() === name.toLowerCase());
  }

  const isExceptionQuery = selectedQueryIndex >= 0 &&
    cannedQueries[selectedQueryIndex]?.Name.toLowerCase().includes('exception');
  const isFailedDependencyQuery = selectedQueryIndex >= 0 &&
    cannedQueries[selectedQueryIndex]?.Name.toLowerCase().includes('failed dependenc');
  const hasOperationId = queryResult !== null && getColIdx('operation_Id') >= 0;
  const hasExpandableDetails =
    queryResult !== null && (getColIdx('innermostMessage') >= 0 || getColIdx('details') >= 0);
  const showExpandColumn = isDrillDown || hasExpandableDetails;

  function substituted(): string {
    if (selectedQueryIndex < 0 || selectedQueryIndex >= cannedQueries.length) return '';
    return substituteTimeRange(
      cannedQueries[selectedQueryIndex].Kql,
      timeRangeOption.ago,
      timeRangeOption.ago2x,
      timeRangeOption.bin,
    );
  }

  async function runQuery() {
    if (!canRunQuery) return;
    setIsLoading(true);
    setErrorMessage('');
    setQueryResult(null);
    setExpandedRow(null);
    setDrillDownType(null);
    try {
      const result = await api.runQuery({
        environmentName: selectedEnvironment,
        kql: substituted(),
      });
      setQueryResult(result);
    } catch (err: unknown) {
      setErrorMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  }

  async function executeDrillDown(kql: string, label: string) {
    setIsLoading(true);
    setErrorMessage('');
    setExpandedRow(null);
    try {
      const result = await api.runQuery({ environmentName: selectedEnvironment, kql });
      setQueryResult(result);
      setDrillDownType(label);
    } catch (err: unknown) {
      setErrorMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  }

  async function onRowClick(rowIndex: number) {
    if (isDrillDown || !queryResult) return;
    if (isExceptionQuery) {
      const typeCol = getColIdx('type');
      if (typeCol < 0) return;
      const exType = queryResult.rows[rowIndex][typeCol];
      if (!exType) return;
      await executeDrillDown(buildDrillDownExceptionKql(exType), exType);
    } else if (isFailedDependencyQuery) {
      const targetCol = getColIdx('target');
      const nameCol = getColIdx('name');
      const target = targetCol >= 0 ? (queryResult.rows[rowIndex][targetCol] ?? '') : '';
      const depName = nameCol >= 0 ? (queryResult.rows[rowIndex][nameCol] ?? '') : '';
      const label = depName || target;
      await executeDrillDown(buildDrillDownDependencyKql(target, depName), label);
    } else if (hasOperationId) {
      const opIdCol = getColIdx('operation_Id');
      if (opIdCol < 0) return;
      const opId = queryResult.rows[rowIndex][opIdCol];
      if (!opId) return;
      await executeDrillDown(
        buildDrillDownCorrelationKql(opId, timeRangeOption.ago),
        `op:${opId}`,
      );
    }
  }

  async function clearDrillDown() {
    setDrillDownType(null);
    setExpandedRow(null);
    await runQuery();
  }

  function toggleAutoRefresh(enabled: boolean) {
    setAutoRefreshEnabled(enabled);
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    if (enabled) {
      refreshTimerRef.current = setInterval(() => { runQuery(); }, 60000);
    }
  }

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, []);

  async function copyDiagnostics() {
    if (!queryResult) return;
    const selectedQuery = selectedQueryIndex >= 0 ? cannedQueries[selectedQueryIndex] : null;
    const text = buildDashboardPrompt(
      queryResult.columns,
      queryResult.rows,
      selectedEnvironment,
      selectedQuery?.Name ?? '',
      selectedTimeRange,
      drillDownType,
      queryResult.executedAt,
      null,
      expandedRow,
    );
    await navigator.clipboard.writeText(text);
    setCopyButtonText('Copied!');
    setTimeout(() => setCopyButtonText('Copy Diagnostics'), 2000);
  }

  async function copyRowDiagnostics(rowIndex: number) {
    if (!queryResult) return;
    const selectedQuery = selectedQueryIndex >= 0 ? cannedQueries[selectedQueryIndex] : null;
    const text = buildDashboardPrompt(
      queryResult.columns,
      queryResult.rows,
      selectedEnvironment,
      selectedQuery?.Name ?? '',
      selectedTimeRange,
      drillDownType,
      queryResult.executedAt,
      rowIndex,
      null,
    );
    await navigator.clipboard.writeText(text);
    setCopiedRow(rowIndex);
    setTimeout(() => setCopiedRow(null), 2000);
  }

  async function analyzeWithAI(rowIndex: number | null) {
    if (!queryResult) return;
    setIsAnalyzing(true);
    setAnalysisText('');
    setAnalysisError('');
    setShowAnalysisModal(true);
    const selectedQuery = selectedQueryIndex >= 0 ? cannedQueries[selectedQueryIndex] : null;
    const prompt = buildDashboardPrompt(
      queryResult.columns,
      queryResult.rows,
      selectedEnvironment,
      selectedQuery?.Name ?? '',
      selectedTimeRange,
      drillDownType,
      queryResult.executedAt,
      rowIndex,
      expandedRow,
    );
    try {
      const result = await api.analyze({ prompt });
      setAnalysisText(result.analysis);
    } catch (err: unknown) {
      setAnalysisError(`Analysis failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsAnalyzing(false);
    }
  }

  // Group by category for optgroup
  const categories = [...new Set(cannedQueries.map(q => q.Category))];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ color: '#002855' }}>App Insights Dashboard</h1>

      {/* Controls */}
      <div className="mb-6 p-4 border-b" style={{ backgroundColor: '#F8FAFC', borderColor: '#D3D5D9', display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
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
          <label className="block mb-1" style={{ color: '#002855', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2px' }}>Query</label>
          <select
            value={selectedQueryIndex}
            onChange={e => setSelectedQueryIndex(Number(e.target.value))}
            style={{ minWidth: '420px', height: '40px', padding: '0 0.75rem', border: '1px solid #D3D5D9', fontSize: '0.875rem', color: '#273139', backgroundColor: '#fff', outline: 'none', borderRadius: 0 }}
            onFocus={e => (e.target.style.borderColor = '#5E9FE8')}
            onBlur={e => (e.target.style.borderColor = '#D3D5D9')}
          >
            <option value={-1}>-- Select Query --</option>
            {categories.map(cat => (
              <optgroup key={cat} label={cat}>
                {cannedQueries.map((q, i) =>
                  q.Category === cat ? (
                    <option key={i} value={i}>{q.Name}</option>
                  ) : null
                )}
              </optgroup>
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

        <button
          onClick={runQuery}
          disabled={!canRunQuery}
          title="Run the selected query against the chosen environment"
          style={{ height: '40px', padding: '0 1.25rem', cursor: canRunQuery ? 'pointer' : 'default', backgroundColor: '#002f6c', color: '#fff', border: 'none', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', borderRadius: 0, opacity: canRunQuery ? 1 : 0.5 }}
        >
          {isLoading ? 'Running...' : 'Run Query'}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <input
            type="checkbox"
            id="autoRefresh"
            checked={autoRefreshEnabled}
            onChange={e => toggleAutoRefresh(e.target.checked)}
          />
          <label htmlFor="autoRefresh" style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#002855', letterSpacing: '0.2px' }}>Auto-refresh (60s)</label>
        </div>
      </div>

      {/* Query description + KQL preview */}
      {selectedQueryIndex >= 0 && selectedQueryIndex < cannedQueries.length && (
        <>
          <p style={{ color: '#757575', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
            {cannedQueries[selectedQueryIndex].Description}
          </p>
          <details style={{ marginBottom: '1rem' }}>
            <summary style={{ cursor: 'pointer', color: '#002f6c', fontSize: '0.875rem', fontWeight: 600 }}>Show KQL</summary>
            <pre style={{ background: '#F7F7F7', padding: '0.8rem', borderRadius: 0, overflowX: 'auto', marginTop: '0.5rem', fontSize: '0.82rem', border: '1px solid #D3D5D9' }}>
              {substituted()}
            </pre>
          </details>
        </>
      )}

      {/* Error */}
      {errorMessage && (
        <div style={{ backgroundColor: '#fff0f0', border: '1px solid rgba(208,2,27,0.3)', padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.875rem', color: '#D0021B' }}>
          {errorMessage}
        </div>
      )}

      {/* Results */}
      {queryResult && (
        <>
          <p style={{ color: '#757575', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
            Executed at: {formatTimestampFull(queryResult.executedAt)} &mdash; {queryResult.rows.length} row(s)
            {drillDownType && (
              <span>
                {' '}&mdash; Filtered by: <strong>{drillDownType}</strong>
                <a
                  href="#"
                  onClick={e => { e.preventDefault(); clearDrillDown(); }}
                  style={{ marginLeft: '0.5rem', color: '#002f6c' }}
                >
                  [clear filter]
                </a>
              </span>
            )}
          </p>

          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <button
              onClick={copyDiagnostics}
              title="Copy all result rows to clipboard as plain text"
              style={{ height: '32px', padding: '0 0.8rem', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', backgroundColor: '#002f6c', color: '#fff', border: 'none', borderRadius: 0 }}
            >
              {copyButtonText}
            </button>
            <button
              onClick={() => analyzeWithAI(null)}
              disabled={isAnalyzing}
              title="Send all rows to Claude AI for analysis"
              style={{ height: '32px', padding: '0 0.8rem', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', backgroundColor: '#002f6c', color: '#fff', border: 'none', borderRadius: 0, opacity: isAnalyzing ? 0.6 : 1 }}
            >
              {isAnalyzing ? 'Analyzing...' : 'Analyze with AI'}
            </button>
          </div>

          <div style={{ overflowX: 'auto', border: '1px solid #D3D5D9' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#F9F9F9' }}>
                  {showExpandColumn && (
                    <th style={{ padding: '0.75rem 0.8rem', width: '2rem', borderBottom: '1px solid #D3D5D9' }}></th>
                  )}
                  {queryResult.columns.map((col, ci) => {
                    if (showExpandColumn && isHiddenCol(col)) return null;
                    return (
                      <th key={ci} style={{ padding: '0.75rem 0.8rem', textAlign: 'left', whiteSpace: 'nowrap', color: '#002855', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2px', borderBottom: '1px solid #D3D5D9' }}>
                        {col}
                      </th>
                    );
                  })}
                  <th style={{ padding: '0.75rem 0.4rem', width: '6rem', borderBottom: '1px solid #D3D5D9' }}></th>
                </tr>
              </thead>
              <tbody>
                {queryResult.rows.map((row, rowIdx) => {
                  const isExpanded = expandedRow === rowIdx;
                  const isClickable = !isDrillDown && (isExceptionQuery || isFailedDependencyQuery || hasOperationId);
                  const rowBg = isExpanded
                    ? 'background: #e8f0fe;'
                    : isCorrelationDrillDown
                    ? getCorrelationRowBg(row, queryResult.columns)
                    : '';

                  const detailsCol = getColIdx('details');
                  const outerMsgCol2 = getColIdx('outerMessage') >= 0 ? getColIdx('outerMessage') : getColIdx('Detail');
                  const innerMsgCol = getColIdx('innermostMessage');
                  const exTypeCol = getColIdx('ExType') >= 0 ? getColIdx('ExType') : getColIdx('Name');
                  const exChainCol = getColIdx('ExceptionChain');
                  const parsedDet = showExpandColumn && isExpanded && detailsCol >= 0
                    ? parseDetails(row[detailsCol] ?? '')
                    : null;

                  return (
                    <React.Fragment key={rowIdx}>
                      <tr
                        style={{ borderBottom: '1px solid #f0f0f0', cursor: isClickable ? 'pointer' : 'default' }}
                        className="hover:bg-[#E8EFF7]/50"
                        onClick={() => isClickable ? onRowClick(rowIdx) : (showExpandColumn ? setExpandedRow(isExpanded ? null : rowIdx) : undefined)}
                      >
                        {showExpandColumn && (
                          <td
                            style={{ padding: '0.4rem 0.5rem', textAlign: 'center', cursor: 'pointer', userSelect: 'none', color: '#757575', fontSize: '0.75rem' }}
                            onClick={e => { e.stopPropagation(); setExpandedRow(isExpanded ? null : rowIdx); }}
                          >
                            {isExpanded ? '▼' : '▶'}
                          </td>
                        )}
                        {row.map((cell, ci) => {
                          const colName = ci < queryResult.columns.length ? queryResult.columns[ci] : '';
                          if (showExpandColumn && isHiddenCol(colName)) return null;
                          const v = cell ?? '';
                          return (
                            <td
                              key={ci}
                              style={{ padding: '0.5rem 0.75rem', maxWidth: '600px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.875rem', color: '#273139', borderBottom: 'none' }}
                              title={v}
                            >
                              {v}
                            </td>
                          );
                        })}
                        <td
                          style={{ padding: '0.2rem 0.4rem', whiteSpace: 'nowrap' }}
                          onClick={e => e.stopPropagation()}
                        >
                          <button
                            onClick={() => copyRowDiagnostics(rowIdx)}
                            title="Copy this row's diagnostics to clipboard"
                            style={{ padding: '0.15rem 0.5rem', fontSize: '0.7rem', cursor: 'pointer', marginRight: '0.2rem', backgroundColor: '#002f6c', color: '#fff', border: 'none', borderRadius: 0, fontWeight: 700, textTransform: 'uppercase' }}
                          >
                            {copiedRow === rowIdx ? 'Copied!' : 'Copy'}
                          </button>
                          <button
                            onClick={() => analyzeWithAI(rowIdx)}
                            disabled={isAnalyzing}
                            title="Analyze this row with Claude AI"
                            style={{ padding: '0.15rem 0.5rem', fontSize: '0.7rem', cursor: 'pointer', backgroundColor: '#002f6c', color: '#fff', border: 'none', borderRadius: 0, fontWeight: 700, textTransform: 'uppercase', opacity: isAnalyzing ? 0.6 : 1 }}
                          >
                            AI
                          </button>
                        </td>
                      </tr>

                      {showExpandColumn && isExpanded && (
                        <tr key={`exp-${rowIdx}`}>
                          <td colSpan={queryResult.columns.length + 2} style={{ padding: 0 }}>
                            <div style={{ background: '#1e1e1e', color: '#d4d4d4', padding: '1rem', margin: '0.25rem 0.5rem 0.5rem', borderRadius: '4px', overflowX: 'auto' }}>
                              {exTypeCol >= 0 && row[exTypeCol] && (
                                <div style={{ marginBottom: '0.75rem' }}>
                                  <span style={{ color: '#569cd6', fontWeight: 'bold' }}>Exception Type: </span>
                                  <span style={{ color: '#dcdcaa' }}>{row[exTypeCol]}</span>
                                </div>
                              )}
                              {outerMsgCol2 >= 0 && row[outerMsgCol2] && (
                                <div style={{ marginBottom: '0.75rem' }}>
                                  <span style={{ color: '#569cd6', fontWeight: 'bold' }}>Outer Message: </span>
                                  <span style={{ color: '#ce9178' }}>{row[outerMsgCol2]}</span>
                                </div>
                              )}
                              {innerMsgCol >= 0 && row[innerMsgCol] && (
                                <div style={{ marginBottom: '0.75rem' }}>
                                  <span style={{ color: '#569cd6', fontWeight: 'bold' }}>Innermost Message: </span>
                                  <span style={{ color: '#ce9178' }}>{row[innerMsgCol]}</span>
                                </div>
                              )}
                              {exChainCol >= 0 && row[exChainCol] && (
                                <div style={{ marginBottom: '0.75rem' }}>
                                  <span style={{ color: '#569cd6', fontWeight: 'bold' }}>Exception Chain: </span>
                                  <span style={{ color: '#dcdcaa' }}>{row[exChainCol]}</span>
                                </div>
                              )}
                              {parsedDet ? (
                                <StackTrace entries={parsedDet} />
                              ) : detailsCol >= 0 && row[detailsCol] ? (
                                <>
                                  <div style={{ color: '#569cd6', fontWeight: 'bold', marginBottom: '0.25rem' }}>Raw Details:</div>
                                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '0.82rem', lineHeight: 1.5, color: '#d4d4d4' }}>
                                    {row[detailsCol]}
                                  </pre>
                                </>
                              ) : exTypeCol >= 0 && !row[exTypeCol] ? (
                                <em style={{ color: '#888' }}>No correlated exception found for this dependency call.</em>
                              ) : (
                                <em style={{ color: '#888' }}>No details column found.</em>
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
