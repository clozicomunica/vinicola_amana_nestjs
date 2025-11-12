/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// src/webhooks/webhooks.service.ts
// Novo: Lógica de webhooks.routes.js
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import {
  NuvemshopService,
  CreateOrderPayload,
} from '../common/services/nuvemshop/nuvemshop.service';
import * as crypto from 'crypto';
import { Request } from 'express';

@Injectable()
export class WebhooksService {
  private readonly mp: MercadoPagoConfig;

  constructor(
    private readonly configService: ConfigService,
    private readonly nuvemshopService: NuvemshopService,
  ) {
    const accessToken = this.configService.get<string>('MP_ACCESS_TOKEN');
    if (!accessToken) {
      throw new Error('MP_ACCESS_TOKEN is not configured');
    }
    this.mp = new MercadoPagoConfig({ accessToken });
  }

  private verifyWebhook(rawBody: string, hmacHeader: string): boolean {
    const appSecret = this.configService.get<string>(
      'NUVEMSHOP_CLIENT_SECRET',
      '',
    );
    const hmac = crypto
      .createHmac('sha256', appSecret)
      .update(rawBody)
      .digest('base64');
    return hmac === hmacHeader;
  }

  async handleOrderPaid(req: Request): Promise<any> {
    const query = req.query || {};
    const body = req.body || {};

    const paymentId =
      query.id ||
      query['data.id'] ||
      body?.data?.id ||
      body?.id ||
      body?.payment_id;

    if (!paymentId) {
      console.warn('[MP Webhook] Payload sem id. Ignorado.', { query, body });
      return { status: 'ignored-no-id' };
    }

    const paymentClient = new Payment(this.mp);
    let payment;
    try {
      payment = await paymentClient.get({ id: String(paymentId) });
    } catch (err) {
      console.error(
        '[MP Webhook] Falha ao buscar payment no MP:',
        err?.response?.data || err?.message || err,
      );
      return { status: 'mp-fetch-error' };
    }

    console.log('[MP Webhook] OK', {
      payment_id: payment.id,
      status: payment.status,
      external_reference: payment.external_reference,
    });

    if (payment.status !== 'approved') {
      return { status: 'ignored-not-approved' };
    }

    const { metadata } = payment;
    if (!metadata || !metadata.produtos || !metadata.cliente) {
      console.warn('[MP Webhook] Metadata incompleto:', metadata);
      return { status: 'ignored-incomplete-metadata' };
    }

    const { produtos, cliente } = metadata;

    const [firstName = 'Cliente', ...lastNameParts] = (
      cliente.name || 'Cliente Anônimo'
    ).split(' ');
    const lastName = lastNameParts.join(' ') || 'Anônimo';

    const address = {
      first_name: firstName,
      last_name: lastName,
      address: cliente.address || 'Não informado',
      number: 'Não informado',
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
      products: produtos.map((p: any) => ({
        variant_id: p.variant_id,
        quantity: p.quantity || 1,
        price: p.price,
      })),
      billing_address: address,
      shipping_address: address,
      gateway: 'mercadopago',
      shipping_pickup_type: 'ship',
      shipping_cost_customer: 0,
    };

    try {
      const nuvemOrder = await this.nuvemshopService.createOrder(orderPayload);
      console.log('[MP Webhook] Pedido criado na Nuvemshop:', nuvemOrder);
      return { status: 'order-created', nuvem_order: nuvemOrder };
    } catch (err) {
      console.error('[MP Webhook] Erro ao criar pedido na Nuvemshop:', err);
      return { status: 'nuvem-error' };
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async handleStoreRedact(req: Request): Promise<void> {
    const rawBody = req.body.toString('utf-8');
    const hmacHeader =
      (req.headers['x-linkedstore-hmac-sha256'] as string) ||
      (req.headers['http_x_linkedstore_hmac_sha256'] as string);

    if (!this.verifyWebhook(rawBody, hmacHeader)) {
      throw new UnauthorizedException('Assinatura inválida');
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { store_id } = JSON.parse(rawBody);
    console.log(`🧹 LGPD: Deletando dados da loja ${store_id}`);
  }

  handleCustomersRedact(req: Request): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const rawBody = req.body.toString('utf-8');
    const hmacHeader =
      (req.headers['x-linkedstore-hmac-sha256'] as string) ||
      (req.headers['http_x_linkedstore_hmac_sha256'] as string);

    if (!this.verifyWebhook(rawBody, hmacHeader)) {
      throw new UnauthorizedException('Assinatura inválida');
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { store_id, customer, orders_to_redact } = JSON.parse(rawBody);
    console.log(
      `🧹 LGPD: Deletando dados do cliente ${customer?.id} da loja ${store_id}, pedidos: ${orders_to_redact}`,
    );
  }

  handleCustomersDataRequest(req: Request): void {
    const rawBody = req.body.toString('utf-8');
    const hmacHeader =
      (req.headers['x-linkedstore-hmac-sha256'] as string) ||
      (req.headers['http_x_linkedstore_hmac_sha256'] as string);

    if (!this.verifyWebhook(rawBody, hmacHeader)) {
      throw new UnauthorizedException('Assinatura inválida');
    }

    const { store_id, customer } = JSON.parse(rawBody);
    console.log(
      `📄 LGPD: Requisição de dados do cliente ${customer?.id} da loja ${store_id}`,
    );
  }
}
