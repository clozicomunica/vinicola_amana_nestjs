/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { Items } from 'mercadopago/dist/clients/commonTypes';
import { PreferenceRequest } from 'mercadopago/dist/clients/preference/commonTypes';
import {
  NuvemshopService,
  CreateOrderPayload,
} from '../nuvemshop/nuvemshop.service';

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
  document?: string;
  address?: string;
  number?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  complement?: string;
}

interface CreateCheckoutBody {
  produtos: Produto[];
  cliente: Cliente;
  total: number;
}

interface PreferenceMetadataProduto {
  variant_id: number;
  quantity: number;
  price: number;
  name: string;
}

@Injectable()
export class MercadoPagoService {
  private readonly mp: MercadoPagoConfig;
  private readonly frontUrl: string;
  private readonly backUrl: string;
  private readonly mode: string;

  constructor(
    private configService: ConfigService,
    private readonly nuvemshopService: NuvemshopService,
  ) {
    const accessToken = this.configService.get<string>('MP_ACCESS_TOKEN');
    if (!accessToken) {
      throw new Error('MP_ACCESS_TOKEN is not defined');
    }
    this.mp = new MercadoPagoConfig({ accessToken });
    this.frontUrl = this.configService.get<string>('FRONT_URL', '');
    this.backUrl = this.configService.get<string>('BACK_URL', '');
    this.mode = this.configService.get<string>('MP_MODE', 'test');
  }

  async createCheckout(body: CreateCheckoutBody) {
    const { produtos, cliente, total } = body;

    if (!produtos || !produtos.length || total <= 0) {
      throw new BadRequestException(
        'Invalid input: products empty or invalid total',
      );
    }

    if (produtos.some((p) => p.quantity <= 0 || p.price <= 0)) {
      throw new BadRequestException('Invalid product quantity or price');
    }

    const [firstName = 'Cliente', ...lastNameParts] = (
      cliente.name || 'Cliente Anônimo'
    ).split(' ');
    const lastName = lastNameParts.join(' ') || 'Anônimo';

    const address = {
      first_name: firstName,
      last_name: lastName,
      address: cliente.address || 'Não informado',
      number: cliente.number ? Number(cliente.number) : 10,
      floor: cliente.complement || '',
      city: cliente.city || 'Não informado',
      province: cliente.state || 'Não informado',
      zipcode: cliente.zipcode || '00000-000',
      country: 'BR',
    };

    const orderPayload: CreateOrderPayload = {
      customer: {
        name: cliente.name || 'Cliente Anônimo',
        email: cliente.email || 'sem-email@exemplo.com',
        document: cliente.document || '00000000000',
      },
      products: produtos.map((p) => ({
        variant_id: p.variant_id,
        quantity: p.quantity || 1,
        price: p.price,
      })),
      billing_address: address,
      shipping_address: address,
      gateway: 'mercadopago',
      shipping_pickup_type: 'ship',
      shipping_cost_customer: 0,
      payment_status: 'pending',
    };

    let nuvemOrder;
    try {
      nuvemOrder = await this.nuvemshopService.createOrder(orderPayload);
      if (!nuvemOrder || !nuvemOrder.id) {
        throw new Error(
          'Falha ao criar pedido na Nuvemshop, ID não retornado.',
        );
      }
      console.log(
        `[MP Service] Pedido ${nuvemOrder.id} criado como 'pending' na Nuvemshop.`,
      );
    } catch (err) {
      console.error(
        '[MP Service] Erro ao criar pedido na Nuvemshop:',
        (err as any)?.response?.data || (err as Error).message,
      );
      throw new InternalServerErrorException(
        'Falha ao registrar pedido na Nuvemshop',
      );
    }
    const preference = new Preference(this.mp);

    const items: Items[] = produtos.map((p) => ({
      id: p.idProduto || p.variant_id.toString(),
      title: p.name,
      quantity: p.quantity,
      unit_price: p.price,
      currency_id: 'BRL',
    }));

    const back_urls = {
      success: `${this.frontUrl}/sucesso`,
      pending: `${this.frontUrl}/pendente`,
      failure: `${this.frontUrl}/falha`,
    };

    const payer =
      this.mode === 'prod'
        ? {
            name: cliente.name,
            email: cliente.email,
            ...(cliente.document
              ? { identification: { type: 'CPF', number: cliente.document } }
              : {}),
          }
        : undefined;
    const safeCliente = {
      name: cliente.name,
      email: cliente.email,
      document: cliente.document ?? '',
      address: cliente.address ?? '',
      city: cliente.city ?? '',
      state: cliente.state ?? '',
      zipcode: cliente.zipcode ?? '',
      complement: cliente.complement ?? '',
    };

    const metadataProdutos: PreferenceMetadataProduto[] = produtos.map((p) => ({
      variant_id: p.variant_id,
      quantity: p.quantity,
      price: p.price,
      name: p.name,
    }));
    const prefBody: PreferenceRequest = {
      items,
      back_urls,
      auto_return: 'approved',
      notification_url: `${this.backUrl}/webhooks/order-paid`,
      external_reference: nuvemOrder.id.toString(),
      metadata: {
        produtos: metadataProdutos,
        cliente: safeCliente,
        total,
        nuvem_order_id: nuvemOrder.id,
      },
      ...(payer ? { payer } : {}),
    };

    try {
      const pref = await preference.create({ body: prefBody });
      const url =
        this.mode === 'test' ? pref.sandbox_init_point : pref.init_point;

      if (!url) {
        throw new InternalServerErrorException('No init_point returned');
      }

      return {
        redirect_url: url,
        preference_id: pref.id,
        mode: this.mode,
      };
    } catch (err) {
      console.error(
        'Falha ao criar preferência MP:',
        (err as any)?.response?.data || (err as Error).message,
      );
      throw new InternalServerErrorException(
        'Failed to create payment preference',
      );
    }
  }
}
