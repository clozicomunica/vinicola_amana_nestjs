import { Module } from '@nestjs/common';
import { NuvemshopService } from '../common/services/nuvemshop/nuvemshop.service';
import { MercadoPagoService } from '../common/services/mercado-pago/mercado-pago.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  controllers: [],
  providers: [NuvemshopService, MercadoPagoService],
  imports: [AuthModule],
  exports: [NuvemshopService, MercadoPagoService],
})
export class CommonModule {}
