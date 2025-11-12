import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { CommonModule } from '../common/common.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [CommonModule, ConfigModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}
