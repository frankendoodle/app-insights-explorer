import { Injectable, Logger } from '@nestjs/common';
import { AppInsightsService } from '../appinsights/appinsights.service';
import { DigestNotification, DigestSection } from './teams-notification.service';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

const DIGEST_KQL = `
exceptions
| where timestamp > ago(24h)
| summarize count = count(), sampleMessage = any(outerMessage) by type
| order by count desc
| take 10
`.trim();

interface TeamConfig {
  team: string;
  webhook: string;
  digest: { time: string };
  environments: string[];
}

@Injectable()
export class DigestService {
  private readonly logger = new Logger(DigestService.name);

  constructor(private readonly appInsights: AppInsightsService) {}

  async buildDigest(
    teamConfig: TeamConfig,
    envMap: Map<string, string>,
  ): Promise<DigestNotification | null> {
    const sections: DigestSection[] = [];

    for (const envName of teamConfig.environments) {
      const resourceId = envMap.get(envName);
      if (!resourceId) {
        this.logger.warn(`Unknown environment in teams config: ${envName}`);
        continue;
      }

      try {
        const result = await this.appInsights.executeQuery(resourceId, DIGEST_KQL);
        const col = (name: string) => result.columns.indexOf(name);
        const topExceptions = result.rows.map(row => ({
          type: row[col('type')] ?? '',
          count: parseInt(row[col('count')] ?? '0', 10),
          sampleMessage: row[col('sampleMessage')] ?? '',
        }));

        if (topExceptions.length > 0) {
          sections.push({ environment: envName, topExceptions });
        }
      } catch (err: any) {
        this.logger.error(`Digest query failed for ${envName}: ${err.message}`);
      }
    }

    if (sections.length === 0) return null;

    const aiSummary = await this.summarizeWithAi(teamConfig.team, sections);
    const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    return { team: teamConfig.team, date, sections, aiSummary };
  }

  private async summarizeWithAi(team: string, sections: DigestSection[]): Promise<string> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return '(AI summary unavailable — ANTHROPIC_API_KEY not set)';

    const content = sections
      .map(s => {
        const lines = s.topExceptions
          .map(ex => `  - ${ex.type} (${ex.count}x): ${ex.sampleMessage}`)
          .join('\n');
        return `${s.environment}:\n${lines}`;
      })
      .join('\n\n');

    const prompt = `You are preparing a morning digest for the ${team} development team.

Here are the top exceptions from the last 24 hours across their environments:

${content}

Write a concise morning digest (3-5 sentences). Focus on:
- What is most critical and needs immediate attention
- Any patterns worth investigating
- What is likely routine and can be deprioritized

Be direct and actionable. No fluff.`;

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
          max_tokens: 512,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!resp.ok) return '(AI summary unavailable)';

      const data = (await resp.json()) as any;
      return data.content?.[0]?.text ?? '(AI summary unavailable)';
    } catch (err: any) {
      this.logger.warn(`AI digest summary failed for ${team}: ${err.message}`);
      return '(AI summary unavailable)';
    }
  }
}
