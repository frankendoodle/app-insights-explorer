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

