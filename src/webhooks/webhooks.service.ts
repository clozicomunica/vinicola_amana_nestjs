/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable prefer-const */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { NuvemshopService } from '../common/services/nuvemshop/nuvemshop.service';
import * as crypto from 'crypto';
import { Request } from 'express';

@Injectable()
export class WebhooksService {
  private readonly mp: MercadoPagoConfig;
  private processedPayments = new Set<string>(); // Previne processamento duplicado

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

    console.log('========================================');
    console.log('[MP Webhook] 🔔 NOVA NOTIFICAÇÃO RECEBIDA');
    console.log('[MP Webhook] Tipo:', body?.type || body?.action);
    console.log('[MP Webhook] Action:', body?.action);
    console.log('[MP Webhook] Query completa:', JSON.stringify(query, null, 2));
    console.log('[MP Webhook] Body completo:', JSON.stringify(body, null, 2));
    console.log('========================================');

    // Extrai o payment ID de várias fontes possíveis
    let paymentId =
      query.id ||
      query['data.id'] ||
      body?.data?.id ||
      body?.id ||
      body?.payment_id;

    console.log('[MP Webhook] 🆔 Payment ID extraído:', paymentId);

    if (!paymentId) {
      console.warn('[MP Webhook] ⚠️ Payload sem payment ID. Ignorando.', {
        query,
        body,
      });
      return { status: 'ignored-no-id' };
    }

    // Previne processamento duplicado
    const paymentKey = `${paymentId}-${Date.now()}`;
    if (this.processedPayments.has(paymentId)) {
      console.log(`[MP Webhook] ⏭️ Pagamento ${paymentId} já processado. Ignorando.`);
      return { status: 'already-processed', payment_id: paymentId };
    }

    // Busca detalhes do pagamento no MP
    const paymentClient = new Payment(this.mp);
    let payment;

    try {
      console.log(`[MP Webhook] 🔍 Buscando detalhes do pagamento ${paymentId} no MP...`);
      payment = await paymentClient.get({ id: String(paymentId) });
      console.log('[MP Webhook] ✅ Pagamento encontrado no MP');
    } catch (err) {
      console.error(
        '[MP Webhook] ❌ Falha ao buscar payment no MP:',
        err?.response?.data || err?.message || err,
      );
      return { status: 'mp-fetch-error', error: err?.message };
    }

    console.log('[MP Webhook] 📋 Detalhes do Pagamento:');
    console.log('  - ID:', payment.id);
    console.log('  - Status:', payment.status);
    console.log('  - Status Detail:', payment.status_detail);
    console.log('  - External Reference:', payment.external_reference);
    console.log('  - Transaction Amount:', payment.transaction_amount);
    console.log('  - Payment Method:', payment.payment_method_id);
    console.log('  - Date Created:', payment.date_created);
    console.log('  - Date Approved:', payment.date_approved);
    console.log('  - Metadata:', JSON.stringify(payment.metadata, null, 2));

    // ⚠️ CRÍTICO: Só processa pagamentos APROVADOS
    if (payment.status !== 'approved') {
      console.log(
        `[MP Webhook] ⏳ Pagamento ainda não aprovado. Status atual: "${payment.status}". Aguardando aprovação...`,
      );
      return {
        status: 'waiting-approval',
        current_status: payment.status,
        status_detail: payment.status_detail,
        payment_id: payment.id,
      };
    }

    // Extrai o ID do pedido da Nuvemshop
    const nuvemOrderId =
      payment.external_reference || payment.metadata?.nuvem_order_id;

    if (!nuvemOrderId) {
      console.warn(
        '[MP Webhook] ⚠️ Pagamento aprovado, mas sem external_reference (ID do pedido Nuvemshop).',
        { payment_id: payment.id },
      );
      return {
        status: 'ignored-no-external-ref',
        payment_id: payment.id,
      };
    }

    console.log(
      `[MP Webhook] 🎯 Pedido identificado: Nuvemshop ID ${nuvemOrderId}`,
    );
    console.log(`[MP Webhook] 💳 Tentando atualizar pedido ${nuvemOrderId} para PAGO...`);

    try {
      // Marca como processado ANTES de atualizar
      this.processedPayments.add(paymentId);

      // Atualiza o pedido na Nuvemshop
      const updateResult = await this.nuvemshopService.updateOrderToPaid(
        nuvemOrderId,
      );

      console.log('========================================');
      console.log(
        `[MP Webhook] ✅✅✅ SUCESSO! Pedido ${nuvemOrderId} atualizado para PAGO na Nuvemshop!`,
      );
      console.log('[MP Webhook] Resultado da atualização:', updateResult);
      console.log('========================================');

      // Limpa após 1 hora (previne memory leak)
      setTimeout(() => {
        this.processedPayments.delete(paymentId);
      }, 3600000);

      return {
        status: 'order-updated',
        nuvem_order_id: nuvemOrderId,
        payment_id: payment.id,
        payment_status: payment.status,
        updated_at: new Date().toISOString(),
      };
    } catch (err) {
      // Remove da lista de processados em caso de erro
      this.processedPayments.delete(paymentId);

      console.error('========================================');
      console.error(
        `[MP Webhook] ❌❌❌ ERRO ao atualizar pedido ${nuvemOrderId} na Nuvemshop:`,
      );
      console.error('Erro:', (err as any)?.response?.data || (err as Error).message);
      console.error('Status HTTP:', (err as any)?.response?.status);
      console.error('========================================');

      // Retorna 200 para evitar retries infinitos do MP
      return {
        status: 'nuvem-update-error',
        error: (err as Error).message,
        nuvem_order_id: nuvemOrderId,
        payment_id: payment.id,
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