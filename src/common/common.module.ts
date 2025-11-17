/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MercadoPagoService } from './services/mercado-pago/mercado-pago.service';
import { NuvemshopService } from './services/nuvemshop/nuvemshop.service';
import { MelhorEnvioService } from './services/melhor-envio/melhor-envio.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [ConfigModule, AuthModule],
  providers: [
    MercadoPagoService,
    NuvemshopService,
    MelhorEnvioService,
  ],
  exports: [
    MercadoPagoService,
    NuvemshopService,
    MelhorEnvioService,
  ],
})
export class CommonModule {}