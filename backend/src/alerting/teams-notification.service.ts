import { Injectable, Logger } from '@nestjs/common';

export interface SpikeNotification {
  environment: string;
  exceptionType: string;
  sampleMessage: string;
  currentCount: number;
  priorCount: number;
  ratio: number;
  detectedBy: string[];
  aiNote?: string;
}

export interface DigestNotification {
  team: string;
  date: string;
  sections: DigestSection[];
  aiSummary: string;
}

export interface DigestSection {
  environment: string;
  topExceptions: Array<{ type: string; count: number; sampleMessage: string }>;
}

@Injectable()
export class TeamsNotificationService {
  private readonly logger = new Logger(TeamsNotificationService.name);

  async sendSpikeAlert(webhook: string, spike: SpikeNotification): Promise<void> {
    const detectedByLabel = spike.detectedBy.join(' + ');
    const ratioLabel = spike.priorCount === 0
      ? `${spike.currentCount} (new — 0 in prior hour)`
      : `${spike.ratio.toFixed(1)}× increase`;

    const card = {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      themeColor: 'D93025',
      title: `🔴 Exception Spike — ${spike.environment}`,
      sections: [
        {
          facts: [
            { name: 'Exception', value: spike.exceptionType },
            { name: 'Sample message', value: spike.sampleMessage || '(no message)' },
            { name: 'Current hour', value: String(spike.currentCount) },
            { name: 'Prior hour', value: String(spike.priorCount) },
            { name: 'Change', value: ratioLabel },
            { name: 'Detected by', value: detectedByLabel },
          ],
        },
        ...(spike.aiNote
          ? [{ title: 'AI Analysis', text: spike.aiNote }]
          : []),
      ],
    };

    await this.post(webhook, card, `spike alert for ${spike.exceptionType} in ${spike.environment}`);
  }

  async sendDigest(webhook: string, digest: DigestNotification): Promise<void> {
    const sections: any[] = digest.sections.map(section => ({
      title: section.environment,
      facts: section.topExceptions.map((ex, i) => ({
        name: `${i + 1}.`,
        value: `**${ex.type}** — ${ex.count} occurrences  \n${ex.sampleMessage || ''}`,
      })),
    }));

    sections.push({ title: 'AI Summary', text: digest.aiSummary });

    const card = {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      themeColor: '0078D7',
      title: `📋 Morning Digest — ${digest.team} (${digest.date})`,
      sections,
    };

    await this.post(webhook, card, `morning digest for ${digest.team}`);
  }

  private async post(webhook: string, card: object, label: string): Promise<void> {
    try {
      const resp = await fetch(webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(card),
      });
      if (!resp.ok) {
        const body = await resp.text();
        this.logger.error(`Teams webhook failed for ${label}: ${resp.status} ${body}`);
      } else {
        this.logger.log(`Sent ${label}`);
      }
    } catch (err: any) {
      this.logger.error(`Teams webhook error for ${label}: ${err.message}`);
    }
  }
}
