import { Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SchedulerService } from './scheduler.service';

@ApiTags('Alerting')
@Controller('api/alerting')
export class AlertingController {
  constructor(private readonly scheduler: SchedulerService) {}

  @ApiOperation({ summary: 'Trigger spike check now', description: 'Runs the hourly spike detection immediately for all teams.' })
  @Post('spike-check')
  async triggerSpikeCheck() {
    await this.scheduler.runHourlySpikeCheck();
    return { triggered: 'spike-check' };
  }

  @ApiOperation({ summary: 'Trigger morning digest now', description: 'Sends the morning digest immediately for all configured teams, ignoring their scheduled time.' })
  @Post('digest')
  async triggerDigest() {
    await this.scheduler.runDigestNow();
    return { triggered: 'digest' };
  }
}
