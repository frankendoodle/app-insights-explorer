export interface AppInsightsEnvironment {
  name: string;
}

export interface CannedQuery {
  Name: string;
  Description: string;
  Category: string;
  Kql: string;
}

export interface QueryRequest {
  environmentName: string;
  kql: string;
}

export interface QueryResult {
  columns: string[];
  rows: (string | null)[][];
  executedAt: string;
}

export interface AnalyzeRequest {
  prompt: string;
}

export interface AnalyzeResponse {
  analysis: string;
}

export interface RawRow {
  timestamp: string;
  itemType: string;
  name: string;
  message: string;
  type: string;
  outerMessage: string;
  innermostMessage: string;
  duration: string;
  resultCode: string;
  success: string;
  severityLevel: string;
  cloudRoleName: string;
  cloudRoleInstance: string;
  operationId: string;
  operationParentId: string;
  customDimensions: string;
  details: string;
  originalIndex: number;
}

export interface ExceptionEntry {
  type: string;
  message: string;
  frames: StackFrame[];
}

export interface StackFrame {
  method: string;
  assembly: string;
  fileName: string;
  line: number;
}
