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
    console.log(req.body);
    
    try {
      const result = await this.webhooksService.handleOrderPaid(req);
      res.status(200).json({ 
        success: true,
        message: 'Webhook processado com sucesso',
        result 
      });
    } catch (error: any) {
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