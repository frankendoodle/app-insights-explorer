import { Body, Controller, Get, HttpException, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppInsightsService } from './appinsights.service';
import { environments, cannedQueries } from '../config/config';
import type { QueryRequest, AnalyzeRequest } from '../dto';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

@ApiTags('App Insights')
@Controller('api')
export class AppInsightsController {
  constructor(private readonly service: AppInsightsService) {}

  @ApiOperation({ summary: 'List configured App Insights environments', description: 'Returns the names of all environments defined in config.json.' })
  @Get('environments')
  getEnvironments() {
    return environments.map(e => ({ name: e.Name }));
  }

  @ApiOperation({ summary: 'List canned KQL queries', description: 'Returns all pre-configured KQL queries grouped by category.' })
  @Get('queries')
  getQueries() {
    return cannedQueries;
  }

  @ApiOperation({ summary: 'Execute a KQL query', description: 'Runs the provided KQL against the specified App Insights environment. Use {timeRange}, {timeRange2x}, and {binSize} placeholders in the KQL — the frontend substitutes these before sending.' })
  @Post('query')
  async runQuery(@Body() req: QueryRequest) {
    const env = environments.find(
      e => e.Name.toLowerCase() === req.environmentName.toLowerCase(),
    );
    if (!env) {
      throw new HttpException(
        `Environment '${req.environmentName}' not found.`,
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      return await this.service.executeQuery(env.ResourceId, req.kql);
    } catch (err: any) {
      throw new HttpException(`Query error: ${err.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @ApiOperation({ summary: 'Analyze telemetry with Claude AI', description: 'Forwards a plain-text telemetry prompt to Claude (claude-sonnet-4-6) and returns the analysis as markdown. Requires ANTHROPIC_API_KEY to be set.' })
  @Post('analyze')
  async analyze(@Body() req: AnalyzeRequest) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new HttpException(
        'Anthropic API key not configured. Set ANTHROPIC_API_KEY environment variable.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    const resp = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        messages: [{ role: 'user', content: req.prompt }],
      }),
    });
    if (!resp.ok) {
      const err = await resp.text();
      throw new HttpException(`Anthropic error: ${err}`, HttpStatus.BAD_GATEWAY);
    }
    const data = (await resp.json()) as any;
    const text: string = data.content?.[0]?.text ?? '';
    return { analysis: text };
  }

}
