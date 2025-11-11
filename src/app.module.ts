import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';
import { CommonModule } from './common/common.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      // O parâmetro isGlobal: true garante que o
      // ConfigService esteja disponível em toda a
      // aplicação, sem a necessidade de importá-lo
      // manualmente em cada módulo.
      isGlobal: true,
    }),
    AuthModule,
    OrdersModule,
    ProductsModule,
    CommonModule,
  ],
})
export class AppModule {}
