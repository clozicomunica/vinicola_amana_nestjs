import { Body, Controller, Post } from '@nestjs/common';
import { MercadoPagoService } from '../common/services/mercado-pago/mercado-pago.service';

@Controller('webhook')
export class WebhookController {
  constructor(private readonly mercadoPagoService: MercadoPagoService) {}

  @Post('mercado-pago')
  async confirmarPagamento(
    @Body() body: { data: { id: string } },
  ): Promise<void> {
    await this.mercadoPagoService.getOrderById(body.data.id);
  }
}
