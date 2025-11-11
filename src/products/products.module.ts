import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { NuvemshopService } from '../common/services/nuvemshop/nuvemshop.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [],
  providers: [ProductsService, NuvemshopService],
})
export class ProductsModule {}
