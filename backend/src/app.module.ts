import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AppInsightsModule } from './appinsights/appinsights.module';
import { AlertingModule } from './alerting/alerting.module';
import { ApiKeyGuard } from './guards/api-key.guard';

@Module({
  imports: [ScheduleModule.forRoot(), AppInsightsModule, AlertingModule],
  providers: [{ provide: APP_GUARD, useClass: ApiKeyGuard }],
})
export class AppModule {}
