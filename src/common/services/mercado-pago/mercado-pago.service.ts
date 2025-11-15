/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { Items } from 'mercadopago/dist/clients/commonTypes';
import { PreferenceRequest } from 'mercadopago/dist/clients/preference/commonTypes';
import {
  NuvemshopService,
  CreateOrderPayload,
  Coupon,
} from '../nuvemshop/nuvemshop.service';

interface Produto {
  quantity: number;
  variant_id: number;
  idProduto: number;
  price?: number;
  name?: string;
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
  couponCode?: string;
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
  private readonly logger = new Logger(MercadoPagoService.name);

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

  private async fetchProduct(productId: number): Promise<any> {
    try {
      const response = await this.nuvemshopService.get(productId);
      return response;
    } catch (err) {
      this.logger.error(`Erro ao buscar produto ${productId}:`, err as any);
      throw new BadRequestException(`Produto inválido: ${productId}`);
    }
  }

  private sanitizeDocument(doc?: string) {
    if (!doc) return '';
    return doc.replace(/\D/g, '');
  }

  private round2(n: number) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  /**
   * Distribui o desconto proporcionalmente entre os itens, retornando novos itens com unit_price ajustado.
   * Isso evita enviar item com unit_price negativo ao Mercado Pago.
   */
  private applyDiscountToItems(
    items: Items[],
    discountAmount: number,
  ): Items[] {
    if (discountAmount <= 0) return items;

    const subtotal = items.reduce(
      (s, it) => s + Number(it.unit_price) * Number(it.quantity),
      0,
    );
    if (subtotal <= 0) return items;

    // calcular desconto proporcional e aplicar por item
    const adjusted: Items[] = items.map((it) => {
      const itemTotal = Number(it.unit_price) * Number(it.quantity);
      const proportion = itemTotal / subtotal;
      const discountShare = this.round2(discountAmount * proportion);
      const discountPerUnit = this.round2(discountShare / Number(it.quantity));
      const newUnit = this.round2(Number(it.unit_price) - discountPerUnit);
      return {
        ...it,
        unit_price: newUnit < 0 ? 0 : newUnit,
      };
    });

    // corrigir arredondamento: garantir que soma dos itens ajustados == subtotal - discountAmount
    const adjustedTotal = adjusted.reduce(
      (s, it) => s + Number(it.unit_price) * Number(it.quantity),
      0,
    );
    const expected = this.round2(subtotal - discountAmount);
    const diff = this.round2(expected - adjustedTotal);
    if (Math.abs(diff) >= 0.01) {
      // aplicar diferença no primeiro item (pode ser positivo ou negativo)
      adjusted[0].unit_price = this.round2(
        Number(adjusted[0].unit_price) + diff / Number(adjusted[0].quantity),
      );
    }

    return adjusted;
  }

  async createCheckout(body: CreateCheckoutBody) {
    const { produtos, cliente, couponCode } = body;

    if (!produtos || !produtos.length) {
      throw new BadRequestException('Invalid input: products empty');
    }

    if (
      produtos.some((p) => p.quantity <= 0 || !p.idProduto || !p.variant_id)
    ) {
      throw new BadRequestException(
        'Invalid product data: missing idProduto, variant_id, or invalid quantity',
      );
    }

    // Buscar produtos únicos em paralelo (1 req por produto)
    const uniqueProductIds = Array.from(
      new Set(produtos.map((p) => p.idProduto)),
    );

    const productsMap: Record<string, any> = {};
    await Promise.all(
      uniqueProductIds.map(async (prodId) => {
        const product = await this.fetchProduct(prodId);

        productsMap[prodId] = product;
      }),
    );

    for (const p of produtos) {
      const product = productsMap[p.idProduto];
      if (!product) {
        throw new BadRequestException(`Produto inválido: ${p.idProduto}`);
      }
      // Encontrar a variante dentro do produto
      const variant = (product.variants || []).find(
        (v: any) => Number(v.id) === Number(p.variant_id),
      );
      if (!variant) {
        throw new BadRequestException(
          `Variante inválida para o produto ${p.idProduto}`,
        );
      }

      const priceNumber = Number(variant.price);
      if (!priceNumber || isNaN(priceNumber) || priceNumber <= 0) {
        throw new BadRequestException(
          `Preço inválido para variante ${p.variant_id} do produto ${p.idProduto}`,
        );
      }
      p.price = priceNumber;
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

    let discountAmount = 0;
    let coupon: Coupon | undefined;
    let note = '';

    // Recalcular subtotal com preços reais
    const subtotal = this.round2(
      produtos.reduce((sum, p) => sum + (p.price ?? 0) * p.quantity, 0),
    );

    if (couponCode) {
      const params = { q: couponCode, valid: true };
      const coupons = await this.nuvemshopService.fetchCoupons(params);
      if (coupons.length > 0) {
        coupon = coupons[0];
        if (coupon.min_price && subtotal < parseFloat(coupon.min_price)) {
          throw new BadRequestException(
            `Subtotal abaixo do mínimo para o cupom: R$ ${coupon.min_price}`,
          );
        }
        if (coupon.max_uses !== null && coupon.used >= coupon.max_uses) {
          throw new BadRequestException('Cupom atingiu o limite de usos.');
        }
        if (coupon.type === 'percentage') {
          discountAmount = this.round2(
            subtotal * (parseFloat(coupon.value) / 100),
          );
        } else if (coupon.type === 'absolute') {
          discountAmount = this.round2(parseFloat(coupon.value));
        }
        note = `Cupom aplicado: ${coupon.code} (ID: ${coupon.id})`;
      } else {
        throw new BadRequestException('Cupom inválido.');
      }
    }

    const calculatedTotal = this.round2(subtotal - discountAmount);
    if (calculatedTotal <= 0) {
      throw new BadRequestException('Total inválido após descontos');
    }

    const orderPayload: CreateOrderPayload = {
      customer: {
        name: cliente.name || 'Cliente Anônimo',
        email: cliente.email || 'sem-email@exemplo.com',
        document: cliente.document || '00000000000',
      },
      products: produtos.map((p) => ({
        variant_id: p.variant_id,
        quantity: p.quantity || 1,
        price: p.price! - discountAmount,
      })),
      billing_address: address,
      shipping_address: address,
      gateway: 'mercadopago',
      shipping_pickup_type: 'ship',
      shipping_cost_customer: 0,
      payment_status: 'pending',
      note: note?.length > 0 ? note : undefined,
    };

    let nuvemOrder: any;
    let idNuvemShop: any;
    try {
      nuvemOrder = await this.nuvemshopService.createOrder(orderPayload);
      if (!nuvemOrder || !nuvemOrder.id) {
        throw new Error(
          'Falha ao criar pedido na Nuvemshop, ID não retornado.',
        );
      }
      this.logger.log(
        `[MP Service] Pedido ${nuvemOrder.id} criado como 'pending' na Nuvemshop.`,
      );
      idNuvemShop = nuvemOrder.id;
    } catch (err) {
      this.logger.error(
        '[MP Service] Erro ao criar pedido na Nuvemshop:',
        (err as any)?.response?.data || (err as Error).message,
      );
      throw new InternalServerErrorException(
        'Falha ao registrar pedido na Nuvemshop',
      );
    }

    const preference = new Preference(this.mp);

    // montar items
    let items: Items[] = produtos.map((p) => ({
      id: p.idProduto || p.variant_id,
      title: p.name ?? 'Produto',
      quantity: p.quantity,
      unit_price: this.round2(p.price ?? 0),
      currency_id: 'BRL',
    }));

    // aplicar desconto distribuído (evita item negativo)
    if (discountAmount > 0) {
      items = this.applyDiscountToItems(items, discountAmount);
    }

    const back_urls = {
      success: `${this.frontUrl}/sucesso/${nuvemOrder.id}`,
      pending: `${this.frontUrl}/pendente`,
      failure: `${this.frontUrl}/falha`,
    };

    const cleanedDoc = this.sanitizeDocument(cliente.document);
    const payer =
      this.mode === 'prod'
        ? {
            name: cliente.name,
            email: cliente.email,
            ...(cleanedDoc && cleanedDoc.length === 11
              ? { identification: { type: 'CPF', number: cleanedDoc } }
              : {}),
          }
        : undefined;

    const safeCliente = {
      name: cliente.name,
      email: cliente.email,
      document: cleanedDoc ?? '',
      address: cliente.address ?? '',
      city: cliente.city ?? '',
      state: cliente.state ?? '',
      zipcode: cliente.zipcode ?? '',
      complement: cliente.complement ?? '',
    };

    const metadataProdutos: PreferenceMetadataProduto[] = produtos.map((p) => ({
      variant_id: p.variant_id,
      quantity: p.quantity,
      price: p.price ?? 0,
      name: p.name ?? 'Produto',
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
        total: calculatedTotal,
        nuvem_order_id: nuvemOrder.id,
      },
      ...(payer ? { payer } : {}),
    };

    try {
      const pref = await preference.create({ body: prefBody });
      const url =
        this.mode === 'test'
          ? (pref as any).sandbox_init_point
          : (pref as any).init_point;

      if (!url) {
        // tentativa de rollback (melhor esforço)
        try {
          if ((this.nuvemshopService as any).cancelOrder) {
            await (this.nuvemshopService as any).cancelOrder(nuvemOrder.id, {
              reason: 'preference_failed',
            });
          }
        } catch (rollErr) {
          this.logger.error(
            'Falha ao tentar cancelar pedido após erro de preferência:',
            rollErr as any,
          );
        }

        throw new InternalServerErrorException('No init_point returned');
      }

      return {
        redirect_url: url,
        preference_id: (pref as any).id,
        mode: this.mode,
        idNuvemShop,
      };
    } catch (err) {
      this.logger.error(
        'Falha ao criar preferência MP:',
        (err as any)?.response?.data || (err as Error).message,
      );
      // rollback: tentar cancelar pedido criado na nuvemshop (melhor esforço)
      try {
        if ((this.nuvemshopService as any).cancelOrder) {
          await (this.nuvemshopService as any).cancelOrder(nuvemOrder.id, {
            reason: 'preference_failed',
          });
          this.logger.log(
            `Pedido ${nuvemOrder.id} cancelado na Nuvemshop após falha na preferência.`,
          );
        }
      } catch (rollErr) {
        this.logger.error(
          'Falha ao tentar cancelar pedido após erro de preferência:',
          rollErr as any,
        );
      }

      throw new InternalServerErrorException(
        'Failed to create payment preference',
      );
    }
  }
}
