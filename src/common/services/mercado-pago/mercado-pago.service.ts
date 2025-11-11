import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { Items } from 'mercadopago/dist/clients/commonTypes';
import { PreferenceRequest } from 'mercadopago/dist/clients/preference/commonTypes';

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

  constructor(private configService: ConfigService) {
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

    if (!produtos.length || total <= 0) {
      throw new BadRequestException(
        'Invalid input: products empty or invalid total',
      );
    }

    if (produtos.some((p) => p.quantity <= 0 || p.price <= 0)) {
      throw new BadRequestException('Invalid product quantity or price');
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
      success: `${this.frontUrl}/checkout/sucesso`,
      pending: `${this.frontUrl}/checkout/pendente`,
      failure: `${this.frontUrl}/checkout/erro`,
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
      external_reference: `order_${Date.now()}`,
      metadata: {
        produtos: metadataProdutos,
        cliente: safeCliente,
        total,
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
    } catch {
      throw new InternalServerErrorException('Failed to create preference');
    }
  }
}
