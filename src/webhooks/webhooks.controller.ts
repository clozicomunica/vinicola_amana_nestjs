/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable prettier/prettier */
import { Controller, Post, Get, Req, Res } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import type { Request, Response } from 'express';

@Controller('webhook')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Get('order-paid')
  healthcheck(@Res() res: Response) {
    res.status(200).send('OK');
  }

  @Post('order-paid')
  async orderPaid(@Req() req: Request, @Res() res: Response) {
  try {
    console.log('========================================');
    console.log('[Webhook Controller] Nova requisição recebida');
    console.log('[Webhook Controller] Headers:', req.headers);
    console.log('[Webhook Controller] Query:', req.query);
    console.log('[Webhook Controller] Body:', req.body);
    console.log('========================================');
    
    const result = await this.webhooksService.handleOrderPaid(req);
    
    console.log('[Webhook Controller] Resultado:', result);
    res.status(200).json(result);
  } catch (error) {
    console.error('[Webhook Controller] Erro:', error);
    res.status(200).json({ status: 'error-logged' });
  }
}

  @Post('store-redact')
  async storeRedact(@Req() req: Request, @Res() res: Response) {
    try {
      await this.webhooksService.handleStoreRedact(req);
      res.status(200).send('OK');
    } catch (error) {
      console.error('store-redact error:', error);
      res.status(200).send('logged');
    }
  }

  @Post('customers-redact')
  async customersRedact(@Req() req: Request, @Res() res: Response) {
    try {
      await this.webhooksService.handleCustomersRedact(req);
      res.status(200).send('OK');
    } catch (error) {
      console.error('customers-redact error:', error);
      res.status(200).send('logged');
    }
  }

  @Post('customers-data-request')
  async customersDataRequest(@Req() req: Request, @Res() res: Response) {
    try {
      await this.webhooksService.handleCustomersDataRequest(req);
      res.status(200).send('OK');
    } catch (error) {
      console.error('customers-data-request error:', error);
      res.status(200).send('logged');
    }
  }
}
