import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppService {
  constructor(private readonly config: ConfigService) {}

  getHello(): string {
    const testId = this.config.get<string>('TEST_ID');
    return `Hello World! Current TEST_ID=${testId ?? ''}`;
  }
}
