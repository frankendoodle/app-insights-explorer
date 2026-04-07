import { Injectable, Logger } from '@nestjs/common';
import { AppInsightsService } from '../appinsights/appinsights.service';
import { SpikeNotification } from './teams-notification.service';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';
const DEFAULT_THRESHOLD = 3.0;
const MIN_COUNT = 5;

const SPIKE_KQL = `
let currentWindow = exceptions
| where timestamp > ago(1h)
| summarize currentCount = count(), sampleMessage = any(outerMessage) by type;
let priorWindow = exceptions
| where timestamp between(ago(2h) .. ago(1h))
| summarize priorCount = count() by type;
currentWindow
| join kind=leftouter priorWindow on type
| extend priorCount = coalesce(priorCount, 0)
| extend ratio = iff(priorCount == 0, todouble(currentCount), todouble(currentCount) / todouble(priorCount))
| where currentCount >= ${MIN_COUNT}
| project type, sampleMessage, currentCount, priorCount, ratio
| order by ratio desc
| take 30
`.trim();

interface ExceptionRow {
  type: string;
  sampleMessage: string;
  currentCount: number;
  priorCount: number;
  ratio: number;
}

interface AiDecision {
  type: string;
  actionable: boolean;
  reason?: string;
}

@Injectable()
export class SpikeDetectionService {
  private readonly logger = new Logger(SpikeDetectionService.name);

  constructor(private readonly appInsights: AppInsightsService) {}

  async detectSpikes(
    environmentName: string,
    resourceId: string,
    thresholdMultiplier = DEFAULT_THRESHOLD,
  ): Promise<SpikeNotification[]> {
    let rows: ExceptionRow[];
    try {
      rows = await this.queryRows(resourceId);
    } catch (err: any) {
      this.logger.error(`Spike query failed for ${environmentName}: ${err.message}`);
      return [];
    }

    if (rows.length === 0) return [];

    const [thresholdSpikes, aiDecisions] = await Promise.all([
      this.runThresholdDetection(rows, thresholdMultiplier),
      this.runAiDetection(environmentName, rows),
    ]);

    return this.mergeResults(environmentName, rows, thresholdSpikes, aiDecisions);
  }

  private async queryRows(resourceId: string): Promise<ExceptionRow[]> {
    const result = await this.appInsights.executeQuery(resourceId, SPIKE_KQL);
    const col = (name: string) => result.columns.indexOf(name);
    return result.rows.map(row => ({
      type: row[col('type')] ?? '',
      sampleMessage: row[col('sampleMessage')] ?? '',
      currentCount: parseInt(row[col('currentCount')] ?? '0', 10),
      priorCount: parseInt(row[col('priorCount')] ?? '0', 10),
      ratio: parseFloat(row[col('ratio')] ?? '0'),
    }));
  }

  private runThresholdDetection(rows: ExceptionRow[], threshold: number): Set<string> {
    return new Set(
      rows
        .filter(r => r.ratio >= threshold || r.priorCount === 0)
        .map(r => r.type),
    );
  }

  private async runAiDetection(environmentName: string, rows: ExceptionRow[]): Promise<AiDecision[]> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return [];

    const summary = rows
      .map(r => `- ${r.type}: current=${r.currentCount}, prior=${r.priorCount}, ratio=${r.ratio.toFixed(1)}×`)
      .join('\n');

    const prompt = `You are analyzing exception telemetry for ${environmentName}.

Below is a comparison of exception counts between the current hour and the prior hour.
Identify which exception types represent genuine spikes worth alerting a development team about — not routine background noise.

Data:
${summary}

Respond with a JSON array only, no other text:
[
  { "type": "ExceptionTypeName", "actionable": true, "reason": "brief reason" },
  { "type": "ExceptionTypeName", "actionable": false }
]`;

    try {
      const resp = await fetch(ANTHROPIC_API, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!resp.ok) return [];

      const data = (await resp.json()) as any;
      const text: string = data.content?.[0]?.text ?? '';
      return JSON.parse(text) as AiDecision[];
    } catch (err: any) {
      this.logger.warn(`AI spike detection failed for ${environmentName}: ${err.message}`);
      return [];
    }
  }

  private mergeResults(
    environmentName: string,
    rows: ExceptionRow[],
    thresholdSpikes: Set<string>,
    aiDecisions: AiDecision[],
  ): SpikeNotification[] {
    const aiActionable = new Map(
      aiDecisions
        .filter(d => d.actionable)
        .map(d => [d.type, d.reason]),
    );

    const allFlagged = new Set([...thresholdSpikes, ...aiActionable.keys()]);

    return rows
      .filter(r => allFlagged.has(r.type))
      .map(r => {
        const detectedBy: string[] = [];
        if (thresholdSpikes.has(r.type)) detectedBy.push('threshold');
        if (aiActionable.has(r.type)) detectedBy.push('ai');

        return {
          environment: environmentName,
          exceptionType: r.type,
          sampleMessage: r.sampleMessage,
          currentCount: r.currentCount,
          priorCount: r.priorCount,
          ratio: r.ratio,
          detectedBy,
          aiNote: aiActionable.get(r.type),
        };
      });
  }
}
