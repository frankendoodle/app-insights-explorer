import { Module } from '@nestjs/common';
import { AppInsightsModule } from '../appinsights/appinsights.module';
import { SchedulerService } from './scheduler.service';
import { SpikeDetectionService } from './spike-detection.service';
import { DigestService } from './digest.service';
import { TeamsNotificationService } from './teams-notification.service';
import { AlertingController } from './alerting.controller';

@Module({
  imports: [AppInsightsModule],
  controllers: [AlertingController],
  providers: [SchedulerService, SpikeDetectionService, DigestService, TeamsNotificationService],
})
export class AlertingModule {}
