import { Injectable } from '@nestjs/common';
import { LogsQueryClient, LogsQueryResultStatus } from '@azure/monitor-query';
import { DefaultAzureCredential, DefaultAzureCredentialOptions } from '@azure/identity';
import { QueryResult } from '../dto';

@Injectable()
export class AppInsightsService {
  private readonly client: LogsQueryClient;

  constructor() {
    const credential = new DefaultAzureCredential({
      excludeEnvironmentCredential: true,
      excludeAzurePowerShellCredential: true,
    } as DefaultAzureCredentialOptions);
    this.client = new LogsQueryClient(credential);
  }

  async executeQuery(resourceId: string, kql: string): Promise<QueryResult> {
    const response = await this.client.queryResource(resourceId, kql, { duration: 'P90D' });
    const r = response as any;
    if (r.status === LogsQueryResultStatus.Failure || r.partialError) {
      throw new Error(r.partialError?.message ?? 'Query failed');
    }
    const table = r.tables[0];
    const columns: string[] = table.columnDescriptors.map((c: any) => c.name ?? '');
    const rows: (string | null)[][] = table.rows.map((row: any[]) =>
      row.map((cell: any) => (cell === null || cell === undefined ? null : String(cell)))
    );
    return { columns, rows, executedAt: new Date().toISOString() };
  }
}
