import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SpikeDetectionService } from './spike-detection.service';
import { DigestService } from './digest.service';
import { TeamsNotificationService } from './teams-notification.service';
import { environments } from '../config/config';
import teamsConfigData from '../config/teams.config.json';

interface TeamConfig {
  team: string;
  webhook: string;
  digest: { time: string };
  environments: string[];
}

const teamsConfig: TeamConfig[] = teamsConfigData as TeamConfig[];

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);
  private readonly envMap: Map<string, string>;

  constructor(
    private readonly spikeDetection: SpikeDetectionService,
    private readonly digest: DigestService,
    private readonly teams: TeamsNotificationService,
  ) {
    this.envMap = new Map(environments.map(e => [e.Name, e.ResourceId]));
  }

  onModuleInit() {
    this.logger.log(
      `Alerting scheduler initialized for ${teamsConfig.length} team(s): ${teamsConfig.map(t => t.team).join(', ')}`,
    );
  }

  @Cron('0 * * * *')
  async runHourlySpikeCheck(): Promise<void> {
    this.logger.log('Running hourly spike check...');

    // Deduplicate: collect unique environments across all teams
    const envNames = [...new Set(teamsConfig.flatMap(t => t.environments))];

    // Query each environment once
    const spikesByEnv = new Map<string, Awaited<ReturnType<SpikeDetectionService['detectSpikes']>>>();
    for (const envName of envNames) {
      const resourceId = this.envMap.get(envName);
      if (!resourceId) continue;
      const spikes = await this.spikeDetection.detectSpikes(envName, resourceId);
      if (spikes.length > 0) spikesByEnv.set(envName, spikes);
    }

    // Fan out to subscribed teams
    for (const team of teamsConfig) {
      if (!team.webhook || team.webhook.startsWith('REPLACE')) continue;

      for (const envName of team.environments) {
        const spikes = spikesByEnv.get(envName);
        if (!spikes) continue;

        for (const spike of spikes) {
          await this.teams.sendSpikeAlert(team.webhook, spike);
        }
      }
    }
  }

  @Cron('0 * * * *')
  async runDigestCheck(): Promise<void> {
    const currentHour = new Date().getHours();

    for (const team of teamsConfig) {
      if (!team.webhook || team.webhook.startsWith('REPLACE')) continue;

      const [digestHour] = team.digest.time.split(':').map(Number);
      if (currentHour !== digestHour) continue;

      await this.sendDigestForTeam(team);
    }
  }

  async runDigestNow(): Promise<void> {
    for (const team of teamsConfig) {
      if (!team.webhook || team.webhook.startsWith('REPLACE')) continue;
      await this.sendDigestForTeam(team);
    }
  }

  private async sendDigestForTeam(team: TeamConfig): Promise<void> {
    this.logger.log(`Sending morning digest for ${team.team}...`);
    const digestData = await this.digest.buildDigest(team, this.envMap);
    if (digestData) {
      await this.teams.sendDigest(team.webhook, digestData);
    }
  }
}
