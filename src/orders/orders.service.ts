import { Injectable } from '@nestjs/common';
import { MercadoPagoService } from '../common/services/mercado-pago/mercado-pago.service';
import { NuvemshopService } from '../common/services/nuvemshop/nuvemshop.service';

interface Produto {
  name: string;
  quantity: number;
  price: number;
  variant_id: number;
  idProduto: string;
}

interface Cliente {
  name: string;
  email: string;
  document: string;
  address: string;
  city: string;
  state: string;
  zipcode: string;
  complement: string;
}

interface CreateCheckoutBody {
  produtos: Produto[];
  cliente: Cliente;
  total: number;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly mercadoPagoService: MercadoPagoService,
    private readonly nuvemShopService: NuvemshopService,
  ) {}

  async createCheckout(body: CreateCheckoutBody) {
    const [firstName = 'Cliente', ...lastNameParts] =
      body.cliente.name.split(' ');
    const lastName = lastNameParts.join(' ') || 'Anônimo';

    const address = {
      first_name: firstName,
      last_name: lastName,
      address: body.cliente.address || 'Não informado',
      number: 'Não informado', // Adjust if available
      floor: body.cliente.complement || '',
      city: body.cliente.city || 'Não informado',
      province: body.cliente.state || 'Não informado',
      zipcode: body.cliente.zipcode || '00000-000',
      country: 'BR',
    };

    const orderPayload = {
      customer: {
        name: body.cliente.name || 'Cliente Anônimo',
        email: body.cliente.email || 'sem-email@exemplo.com',
        document: body.cliente.document || '00000000000',
      },
      products: body.produtos.map((p) => ({
        variant_id: p.variant_id,
        quantity: p.quantity || 1,
        price: p.price,
      })),
      billing_address: address,
      shipping_address: address,
      gateway: 'mercadopago', // Or 'not-provided' if appropriate
      shipping_pickup_type: 'ship', // Adjust based on needs
      shipping_cost_customer: 0, // Adjust if shipping cost is known
    };

    // ✅ Cria o pedido na Nuvemshop
    await this.nuvemShopService.createOrder(orderPayload);

    // 💳 Cria o checkout no Mercado Pago e retorna o resultado
    return this.mercadoPagoService.createCheckout(body);
  }
}
