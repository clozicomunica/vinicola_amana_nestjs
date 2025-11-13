/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, NotFoundException } from '@nestjs/common';
import { MercadoPagoService } from '../common/services/mercado-pago/mercado-pago.service';
import { NuvemshopService } from '../common/services/nuvemshop/nuvemshop.service';

@Injectable()
export class OrdersService {
  constructor(
    private readonly mp: MercadoPagoService,
    private readonly ns: NuvemshopService,
  ) {}

  async createCheckout(data: any) {
    return await this.mp.createCheckout(data);
  }

  async getOrderById(idNuvemShop: string): Promise<any> {
    const nsOrder = await this.ns.getOrderById(idNuvemShop);

    if (!nsOrder) {
      throw new NotFoundException('Pedido não encontrado na Nuvemshop');
    }

    return {
      orderSummary: {
        id: nsOrder.id,
        number: nsOrder.number,
        contact_name: nsOrder.customer?.name,
        contact_email: nsOrder.customer?.email,
        total: nsOrder.total,
        status: nsOrder.status,
        products: nsOrder.products?.map((p) => ({
          name: p.name,
          quantity: p.quantity,
          image: p.image,
        })),
      },
      customer: {
        address: nsOrder.shipping_address?.address,
        city: nsOrder.shipping_address?.city,
        zipcode: nsOrder.shipping_address?.zipcode,
      },
    };
  }
}
