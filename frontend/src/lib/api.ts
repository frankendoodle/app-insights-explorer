import type {
  AppInsightsEnvironment,
  CannedQuery,
  QueryRequest,
  QueryResult,
  AnalyzeRequest,
  AnalyzeResponse,
} from '@/types';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const API_KEY = process.env.NEXT_PUBLIC_BACKEND_API_SECRET ?? '';

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': API_KEY },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    headers: { 'x-api-key': API_KEY },
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export const api = {
  getEnvironments: () => get<AppInsightsEnvironment[]>('/api/environments'),
  getQueries: () => get<CannedQuery[]>('/api/queries'),
  runQuery: (req: QueryRequest) => post<QueryResult>('/api/query', req),
  analyze: (req: AnalyzeRequest) => post<AnalyzeResponse>('/api/analyze', req),
};
