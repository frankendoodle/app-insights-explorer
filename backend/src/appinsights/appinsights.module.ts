import { Module } from '@nestjs/common';
import { AppInsightsController } from './appinsights.controller';
import { AppInsightsService } from './appinsights.service';

@Module({
  controllers: [AppInsightsController],
  providers: [AppInsightsService],
  exports: [AppInsightsService],
})
export class AppInsightsModule {}
