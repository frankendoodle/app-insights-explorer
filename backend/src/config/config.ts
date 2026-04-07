import configData from './config.json';

export interface AppInsightsEnvironment {
  Name: string;
  WorkspaceId?: string;
  ResourceId: string;
}

export interface CannedQuery {
  Name: string;
  Description: string;
  Category: string;
  Kql: string;
}

const data = configData as any;
export const environments: AppInsightsEnvironment[] = data.AppInsightsEnvironments;
export const cannedQueries: CannedQuery[] = data.CannedQueries;
