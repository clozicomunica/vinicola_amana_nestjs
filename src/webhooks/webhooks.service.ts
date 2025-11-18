/* eslint-disable prefer-const */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// src/webhooks/webhooks.service.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import {
  NuvemshopService,
  // O 'CreateOrderPayload' não é mais necessário aqui
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
      throw new Error('MP_ACCESS_TOKEN is not defined');
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

  let paymentId =
    query.id ||
    query['data.id'] ||
    body?.data?.id ||
    body?.id ||
    body?.payment_id;

  console.log('[MP Webhook] ===== NOVA NOTIFICAÇÃO =====');
  console.log('[MP Webhook] Query:', JSON.stringify(query));
  console.log('[MP Webhook] Body:', JSON.stringify(body));
  console.log('[MP Webhook] Payment ID:', paymentId);

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

  console.log('[MP Webhook] Pagamento recebido:', {
    payment_id: payment.id,
    status: payment.status,
    status_detail: payment.status_detail,
    external_reference: payment.external_reference,
    metadata: payment.metadata,
  });

  // ⚠️ CRÍTICO: Só processa pagamentos aprovados
  if (payment.status !== 'approved') {
    console.log(`[MP Webhook] Pagamento não aprovado. Status: ${payment.status}`);
    return { status: 'ignored-not-approved', current_status: payment.status };
  }

  // Pega o ID do pedido da Nuvemshop
  const nuvemOrderId = payment.external_reference || payment.metadata?.nuvem_order_id;

  if (!nuvemOrderId) {
    console.warn(
      '[MP Webhook] Pagamento aprovado, mas sem external_reference.',
      { payment_id: payment.id },
    );
    return { status: 'ignored-no-external-ref' };
  }

  console.log(`[MP Webhook] Tentando atualizar pedido ${nuvemOrderId} para PAGO...`);

  try {
    const result = await this.nuvemshopService.updateOrderToPaid(nuvemOrderId);
    
    console.log(
      `[MP Webhook] ✅ Pedido ${nuvemOrderId} atualizado para PAGO com sucesso!`,
      result
    );
    
    return { 
      status: 'order-updated', 
      nuvem_order_id: nuvemOrderId,
      payment_id: payment.id,
      updated_at: new Date().toISOString()
    };
  } catch (err: any) {
    console.error(
      `[MP Webhook] ❌ Erro ao atualizar pedido ${nuvemOrderId}:`,
      {
        message: err?.message,
        response: err?.response?.data,
        status: err?.response?.status,
      }
    );
    
    // Retorna 200 mesmo com erro para evitar retries infinitos do MP
    return { 
      status: 'nuvem-update-error',
      error: err?.message,
      nuvem_order_id: nuvemOrderId
    };
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

    const { store_id } = JSON.parse(rawBody);
    console.log(`🧹 LGPD: Deletando dados da loja ${store_id}`);
  }

  async handleCustomersRedact(req: Request): Promise<void> {
    const rawBody = req.body.toString('utf-8');
    const hmacHeader =
      (req.headers['x-linkedstore-hmac-sha256'] as string) ||
      (req.headers['http_x_linkedstore_hmac_sha256'] as string);

    if (!this.verifyWebhook(rawBody, hmacHeader)) {
      throw new UnauthorizedException('Assinatura inválida');
    }

    const { store_id, customer, orders_to_redact } = JSON.parse(rawBody);
    console.log(
      `🧹 LGPD: Deletando dados do cliente ${customer?.id} da loja ${store_id}, pedidos: ${orders_to_redact}`,
    );
  }

  async handleCustomersDataRequest(req: Request): Promise<void> {
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
