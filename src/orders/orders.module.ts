import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { CommonModule } from '../common/common.module';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService],
  imports: [CommonModule],
})
export class OrdersModule {}
