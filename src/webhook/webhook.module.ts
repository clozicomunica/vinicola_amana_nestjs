import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [CommonModule],
  controllers: [WebhookController],
  providers: [],
})
export class WebhookModule {}
