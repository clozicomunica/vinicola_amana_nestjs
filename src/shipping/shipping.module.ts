import { Module } from '@nestjs/common';
import { ShippingController } from './shipping.controller';
import { CommonModule } from '../common/common.module';

@Module({
  controllers: [ShippingController],
  imports: [CommonModule],
})
export class ShippingModule {}
