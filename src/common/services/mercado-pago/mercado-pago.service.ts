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
// 👇 IMPORTS ADICIONADOS
import {
  NuvemshopService,
  CreateOrderPayload,
} from '../nuvemshop/nuvemshop.service'; // Verifique se este caminho está correto

// --- Interfaces (copiadas do seu arquivo original) ---

interface Produto {
  name: string;
  quantity: number;
  price: number;
  variant_id: number;
  idProduto: string; // Isso vem do seu DTO, mantido
}

// Interface Cliente atualizada para incluir 'number' que vem do frontend
interface Cliente {
  name: string;
  email: string;
  document?: string;
  address?: string;
  number?: string; // Adicionado (vem do CartPage.tsx)
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

// --- Fim das Interfaces ---

@Injectable()
export class MercadoPagoService {
  private readonly mp: MercadoPagoConfig;
  private readonly frontUrl: string;
  private readonly backUrl: string;
  private readonly mode: string;

  constructor(
    private configService: ConfigService,
    // 👇 INJEÇÃO ADICIONADA
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

    // 1. Validações (manter)
    if (!produtos || !produtos.length || total <= 0) {
      throw new BadRequestException(
        'Invalid input: products empty or invalid total',
      );
    }

    if (produtos.some((p) => p.quantity <= 0 || p.price <= 0)) {
      throw new BadRequestException('Invalid product quantity or price');
    }

    // 2. Criar Pedido na Nuvemshop PRIMEIRO
    const [firstName = 'Cliente', ...lastNameParts] = (
      cliente.name || 'Cliente Anônimo'
    ).split(' ');
    const lastName = lastNameParts.join(' ') || 'Anônimo';

    // O 'number' vem do frontend 'CartPage.tsx'
    const address = {
      first_name: firstName,
      last_name: lastName,
      address: cliente.address || 'Não informado',
      number: cliente.number || 'S/N', // Usando o 'number' do cliente
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
      payment_status: 'pending', // 👈 Criar como pendente
    };

    let nuvemOrder;
    try {
      // Usando 'any' temporariamente pois não temos a interface de retorno da Nuvemshop
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
    // --- Fim da Criação Nuvemshop ---

    // 3. Preparar Preferência do Mercado Pago
    const preference = new Preference(this.mp);

    const items: Items[] = produtos.map((p) => ({
      id: p.idProduto || p.variant_id.toString(), //
      title: p.name, //
      quantity: p.quantity, //
      unit_price: p.price, //
      currency_id: 'BRL', //
    }));

    const back_urls = {
      success: `${this.frontUrl}/checkout/sucesso`, //
      pending: `${this.frontUrl}/checkout/pendente`, //
      failure: `${this.frontUrl}/checkout/erro`, //
    };

    const payer =
      this.mode === 'prod' //
        ? {
            name: cliente.name,
            email: cliente.email,
            ...(cliente.document
              ? { identification: { type: 'CPF', number: cliente.document } }
              : {}),
          }
        : undefined;

    // Metadata para o MP (para referência)
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

    // 4. Montar Body da Preferência
    const prefBody: PreferenceRequest = {
      items,
      back_urls,
      auto_return: 'approved', //
      notification_url: `${this.backUrl}/webhooks/order-paid`, //
      // 👇 MUDANÇA IMPORTANTE
      external_reference: nuvemOrder.id.toString(), // Vincular o ID da Nuvemshop
      metadata: {
        produtos: metadataProdutos,
        cliente: safeCliente,
        total,
        nuvem_order_id: nuvemOrder.id, // Armazenar o ID aqui também
      },
      ...(payer ? { payer } : {}),
    };

    // 5. Criar Preferência e Retornar
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
      // Se falhar aqui, o pedido ficou "pendente" na Nuvemshop,
      // mas não podemos gerar o link de pagamento.
      throw new InternalServerErrorException(
        'Failed to create payment preference',
      );
    }
  }
}
