import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('health')
  health(): { status: 'ok'; service: 'orders-api'; timestamp: string } {
    return {
      status: 'ok',
      service: 'orders-api',
      timestamp: new Date().toISOString(),
    };
  }
}
