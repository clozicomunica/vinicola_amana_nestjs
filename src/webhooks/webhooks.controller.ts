/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable prettier/prettier */
import { Controller, Post, Get, Req, Res } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import type { Request, Response } from 'express';


@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Get('order-paid')
  healthcheck(@Res() res: Response) {
    res.status(200).send('Webhook está ativo e funcionando!');
  }

  
  @Post('order-paid')
  async orderPaid(@Req() req: Request, @Res() res: Response) {
    try {
      console.log('========================================');
      console.log('🔔 [Webhook Controller] Nova requisição recebida do Mercado Pago');
      console.log('[Webhook Controller] Timestamp:', new Date().toISOString());
      console.log('[Webhook Controller] Method:', req.method);
      console.log('[Webhook Controller] URL:', req.url);
      console.log('[Webhook Controller] Headers:', JSON.stringify(req.headers, null, 2));
      console.log('[Webhook Controller] Query:', JSON.stringify(req.query, null, 2));
      console.log('[Webhook Controller] Body:', JSON.stringify(req.body, null, 2));
      console.log('========================================');
      
      
      const result = await this.webhooksService.handleOrderPaid(req);
      
      console.log('✅ [Webhook Controller] Processamento concluído com sucesso');
      console.log('[Webhook Controller] Resultado:', JSON.stringify(result, null, 2));
      
      
      res.status(200).json({ 
        success: true,
        message: 'Webhook processado com sucesso',
        result 
      });
    } catch (error: any) {
      console.error('========================================');
      console.error('❌ [Webhook Controller] ERRO ao processar webhook');
      console.error('[Webhook Controller] Erro:', error);
      console.error('[Webhook Controller] Stack:', error?.stack);
      console.error('========================================');
      
      
      res.status(200).json({ 
        success: false,
        message: 'Erro processado e logado',
        error: error?.message || 'Erro desconhecido'
      });
    }
  }

  
  @Post('store-redact')
  async storeRedact(@Req() req: Request, @Res() res: Response) {
    try {
      await this.webhooksService.handleStoreRedact(req);
      res.status(200).send('OK');
    } catch (error) {
      console.error('❌ store-redact error:', error);
      res.status(200).send('logged');
    }
  }

  @Post('customers-redact')
  async customersRedact(@Req() req: Request, @Res() res: Response) {
    try {
      await this.webhooksService.handleCustomersRedact(req);
      res.status(200).send('OK');
    } catch (error) {
      console.error('❌ customers-redact error:', error);
      res.status(200).send('logged');
    }
  }

  @Post('customers-data-request')
  async customersDataRequest(@Req() req: Request, @Res() res: Response) {
    try {
      await this.webhooksService.handleCustomersDataRequest(req);
      res.status(200).send('OK');
    } catch (error) {
      console.error('❌ customers-data-request error:', error);
      res.status(200).send('logged');
    }
  }
}