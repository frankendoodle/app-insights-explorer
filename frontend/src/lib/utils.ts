import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ExceptionEntry, RawRow, QueryResult } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const TIME_RANGE_OPTIONS = [
  { label: '15 min',   ago: '15m', ago2x: '30m', bin: '1m'  },
  { label: '30 min',   ago: '30m', ago2x: '1h',  bin: '2m'  },
  { label: '1 hour',   ago: '1h',  ago2x: '2h',  bin: '5m'  },
  { label: '4 hours',  ago: '4h',  ago2x: '8h',  bin: '15m' },
  { label: '12 hours', ago: '12h', ago2x: '24h', bin: '30m' },
  { label: '24 hours', ago: '24h', ago2x: '48h', bin: '1h'  },
  { label: '48 hours', ago: '48h', ago2x: '96h', bin: '2h'  },
  { label: '7 days',   ago: '7d',  ago2x: '14d', bin: '6h'  },
];

export function substituteTimeRange(kql: string, ago: string, ago2x: string, bin: string): string {
  return kql
    .replace(/\{timeRange2x\}/g, ago2x)
    .replace(/\{timeRange\}/g, ago)
    .replace(/\{binSize\}/g, bin);
}

export function parseDetails(raw: string): ExceptionEntry[] | null {
  if (!raw) return null;
  let json = raw;
  try {
    const decoded = atob(raw);
    json = decoded;
  } catch {
    json = raw;
  }
  try {
    const parsed = JSON.parse(json);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    const entries: ExceptionEntry[] = arr.map((entry: any) => ({
      type: entry.typeName ?? entry.type ?? '',
      message: entry.message ?? entry.outerMessage ?? '',
      frames: (entry.parsedStack ?? entry.frames ?? []).map((f: any) => ({
        method: f.method ?? f.Method ?? '',
        assembly: f.assembly ?? f.Assembly ?? '',
        fileName: f.fileName ?? f.FileName ?? '',
        line: f.line ?? f.Line ?? 0,
      })),
    }));
    return entries.length > 0 ? entries : null;
  } catch {
    return null;
  }
}

export function parseCustomDimensions(raw: string): Record<string, string> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) {
      const result: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        result[k] = String(v ?? '');
      }
      return result;
    }
  } catch {}
  return null;
}

export function formatTimestamp(ts: string): string {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', second: '2-digit',
      fractionalSecondDigits: 3, hour12: true,
    });
  } catch {
    return ts;
  }
}

export function formatTimestampFull(ts: string): string {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleString('en-US', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: 'numeric', minute: '2-digit', second: '2-digit',
      hour12: true,
    });
  } catch {
    return ts;
  }
}

export function formatDuration(ms: string): string {
  if (!ms) return '';
  const n = parseFloat(ms);
  if (isNaN(n)) return ms;
  if (n >= 1000) return `${(n / 1000).toFixed(2)}s`;
  return `${n.toFixed(1)}ms`;
}

export function isFailure(row: RawRow): boolean {
  if (row.itemType?.toLowerCase() === 'exception') return true;
  const s = (row.success ?? '').toLowerCase();
  return s === 'false' || s === '0';
}

export function severityColor(level: string): string {
  switch (level) {
    case '3': return '#c00';
    case '4': return '#800';
    case '2': return '#b45309';
    default: return '#888';
  }
}

export function severityLabel(level: string): string {
  switch (level) {
    case '0': return 'V';
    case '1': return 'I';
    case '2': return 'W';
    case '3': return 'E';
    case '4': return 'C';
    default: return level;
  }
}

export function getItemTypeBadgeStyle(itemType: string): string {
  switch (itemType?.toLowerCase()) {
    case 'exception':   return 'bg-red-100 text-red-800';
    case 'request':     return 'bg-blue-100 text-blue-800';
    case 'dependency':  return 'bg-yellow-100 text-yellow-800';
    default:            return 'bg-gray-100 text-gray-700';
  }
}

export function getRowBgStyle(itemType: string, isExpanded: boolean): string {
  if (isExpanded) return 'bg-blue-50';
  switch (itemType?.toLowerCase()) {
    case 'exception':  return 'bg-red-50/40';
    case 'request':    return 'bg-blue-50/30';
    case 'dependency': return 'bg-yellow-50/30';
    default:           return '';
  }
}

export function getBadgeInlineStyle(itemType: string): string {
  switch (itemType?.toLowerCase()) {
    case 'exception':   return 'background: #ffcccc; color: #800;';
    case 'request':     return 'background: #cce0ff; color: #005;';
    case 'dependency':  return 'background: #fff0b3; color: #640;';
    case 'trace':       return 'background: #e8e8e8; color: #444;';
    default:            return 'background: #ddd; color: #333;';
  }
}

export function getRowInlineStyle(itemType: string): string {
  switch (itemType?.toLowerCase()) {
    case 'exception':  return 'background: #fff8f8;';
    case 'request':    return 'background: #f8f9ff;';
    case 'dependency': return 'background: #fffdf0;';
    default:           return '';
  }
}

export function getPrimaryDisplay(row: RawRow): string {
  switch (row.itemType?.toLowerCase()) {
    case 'trace':     return row.message;
    case 'exception': return row.outerMessage || row.type;
    default:          return row.name;
  }
}

export function parseRows(result: QueryResult): RawRow[] {
  const cols = result.columns;
  const idx = (name: string) =>
    cols.findIndex(c => c.toLowerCase() === name.toLowerCase());
  const val = (row: (string | null)[], i: number) =>
    (i >= 0 && i < row.length ? row[i] : null) ?? '';

  const tsIdx  = idx('timestamp');       const itIdx  = idx('itemType');
  const nmIdx  = idx('name');            const msgIdx = idx('message');
  const tyIdx  = idx('type');            const omIdx  = idx('outerMessage');
  const imIdx  = idx('innermostMessage');const durIdx = idx('duration');
  const rcIdx  = idx('resultCode');      const sucIdx = idx('success');
  const sevIdx = idx('severityLevel');   const rnIdx  = idx('cloud_RoleName');
  const riIdx  = idx('cloud_RoleInstance');
  const opIdx  = idx('operation_Id');    const ppIdx  = idx('operation_ParentId');
  const cdIdx  = idx('customDimensions');const dtIdx  = idx('details');

  return result.rows.map((row, i) => ({
    timestamp:         val(row, tsIdx),
    itemType:          val(row, itIdx),
    name:              val(row, nmIdx),
    message:           val(row, msgIdx),
    type:              val(row, tyIdx),
    outerMessage:      val(row, omIdx),
    innermostMessage:  val(row, imIdx),
    duration:          val(row, durIdx),
    resultCode:        val(row, rcIdx),
    success:           val(row, sucIdx),
    severityLevel:     val(row, sevIdx),
    cloudRoleName:     val(row, rnIdx),
    cloudRoleInstance: val(row, riIdx),
    operationId:       val(row, opIdx),
    operationParentId: val(row, ppIdx),
    customDimensions:  val(row, cdIdx),
    details:           val(row, dtIdx),
    originalIndex:     i,
  }));
}

export function buildExplorerKql(
  timeRange: string, takeCount: number, problemsOnly: boolean, correlationId?: string
): string {
  const lines: string[] = [
    'union requests, traces, exceptions, dependencies',
    `| where timestamp > ago(${timeRange})`,
    "| where not (itemType == 'request' and name has '/swagger')",
  ];
  if (problemsOnly) {
    lines.push("| where success == false or itemType == 'exception' or severityLevel >= 2");
  }
  if (correlationId) {
    const esc = correlationId.replace(/'/g, "\\'");
    lines.push(`| where operation_Id == '${esc}' or session_Id == '${esc}' or user_Id == '${esc}'`);
  }
  lines.push(
    '| project timestamp, itemType, name, message, type, outerMessage,',
    '    innermostMessage, duration, resultCode, success, severityLevel,',
    '    cloud_RoleName, cloud_RoleInstance, operation_Id, operation_ParentId,',
    '    customDimensions = tostring(customDimensions),',
    '    details = tostring(details)',
    '| order by timestamp asc',
    `| take ${takeCount}`,
  );
  return lines.join('\n');
}

export function buildDrillDownExceptionKql(exceptionType: string): string {
  const esc = exceptionType.replace(/'/g, "\\'");
  return [
    'exceptions',
    '| where timestamp > ago(24h)',
    `| where type == '${esc}'`,
    '| project timestamp, type, outerMessage, innermostMessage, details',
    '| order by timestamp desc',
    '| take 50',
  ].join('\n');
}

export function buildDrillDownDependencyKql(target: string, depName: string): string {
  const lines = [
    'dependencies',
    '| where timestamp > ago(24h)',
    '| where success == false',
  ];
  if (target) lines.push(`| where target == '${target.replace(/'/g, "\\'")}'`);
  if (depName) lines.push(`| where name == '${depName.replace(/'/g, "\\'")}'`);
  lines.push(
    '| project DepTime=timestamp, target, name, resultCode, duration, operation_Id',
    '| join kind=leftouter (',
    '    exceptions',
    '    | where timestamp > ago(24h)',
    '    | project operation_Id, ExType=type, outerMessage, innermostMessage, details',
    ') on operation_Id',
    '| project DepTime, target, name, resultCode, duration, ExType, outerMessage, innermostMessage, details',
    '| order by DepTime desc',
    '| take 50',
  );
  return lines.join('\n');
}

export function buildDrillDownCorrelationKql(operationId: string, timeRange: string): string {
  const esc = operationId.replace(/'/g, "\\'");
  return [
    `let opId = '${esc}';`,
    `let req = requests | where timestamp > ago(${timeRange}) | where operation_Id == opId`,
    '| extend DealId = tostring(customDimensions.DealId)',
    "| project timestamp, TelemetryType='Request', Name=operation_Name, Detail=strcat('HTTP ', resultCode, ' (', round(duration, 1), 'ms)'), Success=tostring(success), DealId, innermostMessage='', ExceptionChain='', details=todynamic(''), operation_Id;",
    `let dep = dependencies | where timestamp > ago(${timeRange}) | where operation_Id == opId`,
    '| extend DealId = tostring(customDimensions.DealId)',
    "| project timestamp, TelemetryType='Dependency', Name=name, Detail=strcat(target, ' \u2192 ', resultCode, ' (', round(duration, 1), 'ms)'), Success=tostring(success), DealId, innermostMessage='', ExceptionChain='', details=todynamic(''), operation_Id;",
    `let exc = exceptions | where timestamp > ago(${timeRange}) | where operation_Id == opId`,
    '| extend DealId = tostring(customDimensions.DealId)',
    "| extend ExceptionChain = strcat_array(array_concat(pack_array(strcat(type, ': ', outerMessage)), iff(innermostMessage != outerMessage, pack_array(strcat('\u2192 Inner: ', innermostMessage)), dynamic([]))), ' | ')",
    "| project timestamp, TelemetryType='Exception', Name=type, Detail=outerMessage, Success='false', DealId, innermostMessage, ExceptionChain, details, operation_Id;",
    `let tr = traces | where timestamp > ago(${timeRange}) | where operation_Id == opId`,
    '| extend DealId = tostring(customDimensions.DealId)',
    "| project timestamp, TelemetryType='Trace', Name=strcat('Level: ', severityLevel), Detail=message, Success='true', DealId, innermostMessage='', ExceptionChain='', details=todynamic(''), operation_Id;",
    'union req, dep, exc, tr',
    '| order by timestamp asc',
  ].join('\n');
}

export function buildRowPrompt(row: RawRow): string {
  return [
    `Telemetry Type: ${row.itemType}`,
    `Timestamp: ${row.timestamp}`,
    `Name: ${row.name}`,
    row.message ? `Message: ${row.message}` : '',
    row.type ? `Exception Type: ${row.type}` : '',
    row.outerMessage ? `Outer Message: ${row.outerMessage}` : '',
    row.innermostMessage ? `Innermost Message: ${row.innermostMessage}` : '',
    row.resultCode ? `Result Code: ${row.resultCode}` : '',
    row.success ? `Success: ${row.success}` : '',
    row.severityLevel ? `Severity Level: ${row.severityLevel}` : '',
    row.duration ? `Duration: ${row.duration}ms` : '',
    row.cloudRoleName ? `Role: ${row.cloudRoleName}` : '',
    row.operationId ? `Operation ID: ${row.operationId}` : '',
    row.customDimensions ? `Custom Dimensions: ${row.customDimensions}` : '',
    row.details ? `Details: ${row.details}` : '',
  ].filter(Boolean).join('\n');
}

const DIAGNOSTIC_PROMPT_PREFIX =
  'You are a senior .NET / Azure engineer. Analyze the following Application Insights telemetry and provide:\n\n' +
  '## Diagnosis\n' +
  '- Root cause: what failed and why\n' +
  '- Call chain that led to the failure\n' +
  '- Pattern classification: transient (timeout, throttle, network blip) vs systematic (bug, config, data issue)\n\n' +
  '## Impact\n' +
  '- What is affected (operations, data, users)\n' +
  '- Severity: Critical / High / Medium / Low\n\n' +
  '## Recommended Fix\n' +
  '- Specific code or configuration changes to resolve this\n' +
  '- Any immediate mitigations\n\n' +
  '## Jira Bug Description\n' +
  'Provide a ready-to-paste Jira ticket:\n' +
  '*Title:* (concise summary)\n' +
  '*Severity:* Critical / High / Medium / Low\n' +
  '*Steps to Reproduce:* (based on the telemetry - include DealId if present)\n' +
  '*Expected Behavior:* what should happen\n' +
  '*Actual Behavior:* what is happening, with key error details\n' +
  '*Stack Trace:* key frames only (omit EF/runtime boilerplate)\n' +
  '*Root Cause:* brief\n' +
  '*Suggested Fix:* brief\n\n' +
  '---\nTELEMETRY DATA:\n\n';

export function buildDashboardPrompt(
  columns: string[],
  rows: (string | null)[][],
  environment: string,
  queryName: string,
  timeRange: string,
  drillDownType: string | null,
  executedAt: string,
  singleRowIndex: number | null,
  expandedRow: number | null,
): string {
  let text = DIAGNOSTIC_PROMPT_PREFIX;
  if (environment) text += `Environment: ${environment}\n`;
  if (queryName) text += `Query: ${queryName}\n`;
  text += `Time Range: ${timeRange}\n`;
  if (drillDownType) text += `Drill-down filter: ${drillDownType}\n`;
  text += `Executed at: ${executedAt}\n`;
  if (singleRowIndex !== null) {
    text += `Row ${singleRowIndex + 1} of ${rows.length} (single-row analysis)\n`;
  } else {
    text += `Rows: ${rows.length}\n`;
  }
  text += '\n';
  text += columns.join(' | ') + '\n';
  text += '-'.repeat(columns.reduce((a, c) => a + c.length + 3, 0)) + '\n';

  const rowsToInclude = singleRowIndex !== null
    ? rows.slice(singleRowIndex, singleRowIndex + 1)
    : rows;

  for (const row of rowsToInclude) {
    const values = row.map((cell, i) => {
      let v = cell ?? '';
      const colName = i < columns.length ? columns[i] : '';
      if (colName.toLowerCase() === 'details' && v.length > 200) v = v.slice(0, 200) + '...';
      return v;
    });
    text += values.join(' | ') + '\n';
  }

  const detailRowIndex = singleRowIndex ?? expandedRow;
  if (detailRowIndex !== null && detailRowIndex < rows.length) {
    const row = rows[detailRowIndex];
    const colIdx = (name: string) =>
      columns.findIndex(c => c.toLowerCase() === name.toLowerCase());
    text += '\n=== ROW DETAILS ===\n';
    const exTypeCol = colIdx('ExType') >= 0 ? colIdx('ExType') : colIdx('Name');
    if (exTypeCol >= 0 && row[exTypeCol]) text += `Exception Type: ${row[exTypeCol]}\n`;
    const outerMsgCol = colIdx('outerMessage') >= 0 ? colIdx('outerMessage') : colIdx('Detail');
    if (outerMsgCol >= 0 && row[outerMsgCol]) text += `Outer Message: ${row[outerMsgCol]}\n`;
    const innerMsgCol = colIdx('innermostMessage');
    if (innerMsgCol >= 0 && row[innerMsgCol]) text += `Innermost Message: ${row[innerMsgCol]}\n`;
    const exChainCol = colIdx('ExceptionChain');
    if (exChainCol >= 0 && row[exChainCol]) text += `Exception Chain: ${row[exChainCol]}\n`;
    const detailsCol = colIdx('details');
    if (detailsCol >= 0) {
      const raw = row[detailsCol] ?? '';
      const parsed = parseDetails(raw);
      if (parsed) {
        for (const entry of parsed) {
          text += `\n${entry.type}\n${entry.message}\n`;
          for (const frame of entry.frames) {
            text += `  at ${frame.method}`;
            if (frame.fileName) {
              text += ` in ${frame.fileName}`;
              if (frame.line > 0) text += `:line ${frame.line}`;
            }
            if (frame.assembly) text += ` [${frame.assembly}]`;
            text += '\n';
          }
        }
      } else {
        text += `Raw Details: ${raw}\n`;
      }
    }
  }

  return text;
}

export function buildExplorerPrompt(
  rows: RawRow[],
  environment: string,
  timeRange: string,
  correlationId: string | null,
  executedAt: string,
): string {
  const AI_PROMPT_PREFIX =
    'You are a senior .NET / Azure engineer. Analyze the following Application Insights raw telemetry and provide:\n\n' +
    '## Diagnosis\n' +
    '- Root cause: what failed and why\n' +
    '- Call chain that led to the failure\n' +
    '- Pattern classification: transient vs systematic\n\n' +
    '## Impact\n' +
    '- What is affected (operations, data, users)\n' +
    '- Severity: Critical / High / Medium / Low\n\n' +
    '## Recommended Fix\n' +
    '- Specific code or configuration changes\n' +
    '- Any immediate mitigations\n\n' +
    '## Jira Bug Description\n' +
    'Provide a ready-to-paste Jira ticket:\n' +
    '*Title:* (concise summary)\n' +
    '*Severity:* Critical / High / Medium / Low\n' +
    '*Root Cause:* brief\n' +
    '*Suggested Fix:* brief\n\n' +
    '---\nTELEMETRY DATA:\n\n';

  let text = AI_PROMPT_PREFIX;
  text += `Environment: ${environment}\n`;
  text += `Time Range: ${timeRange}\n`;
  if (correlationId) text += `Correlation ID: ${correlationId}\n`;
  text += `Executed at: ${executedAt}\n\n`;

  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.itemType] = (counts[r.itemType] ?? 0) + 1;
  text += 'Counts: ' + Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(', ') + '\n\n';

  for (const row of rows) {
    text += `[${formatTimestamp(row.timestamp)}] [${row.itemType}] ${getPrimaryDisplay(row)}\n`;
    if (row.type) text += `  type: ${row.type}\n`;
    if (row.innermostMessage && row.innermostMessage !== row.outerMessage)
      text += `  innermost: ${row.innermostMessage}\n`;
    if (row.outerMessage) text += `  outerMessage: ${row.outerMessage}\n`;
    if (row.duration) text += `  duration: ${formatDuration(row.duration)}\n`;
    if (row.resultCode) text += `  resultCode: ${row.resultCode}\n`;
    if (row.operationId) text += `  operation_Id: ${row.operationId}\n`;
    if (row.cloudRoleName) text += `  role: ${row.cloudRoleName}\n`;
    const dims = parseCustomDimensions(row.customDimensions);
    if (dims && Object.keys(dims).length > 0) {
      text += `  customDimensions: ${Object.entries(dims).map(([k, v]) => `${k}=${v}`).join(', ')}\n`;
    }
    const details = parseDetails(row.details);
    if (details) {
      for (const entry of details) {
        text += `  [${entry.type}] ${entry.message}\n`;
        for (const frame of entry.frames.slice(0, 8)) {
          text += `    at ${frame.method}${frame.line > 0 ? ` :${frame.line}` : ''}\n`;
        }
      }
    }
  }

  return text;
}
