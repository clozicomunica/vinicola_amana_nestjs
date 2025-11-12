import { Controller, Post, Get, Req, Res } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import type { Request, Response } from 'express';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Get('order-paid')
  healthcheck(@Res() res: Response) {
    res.status(200).send('OK');
  }

  @Post('order-paid')
  async orderPaid(@Req() req: Request, @Res() res: Response) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const result = await this.webhooksService.handleOrderPaid(req);
      res.status(200).json(result);
    } catch (error) {
      console.error('[MP Webhook] Error:', error);
      res.status(200).json({ status: 'error-logged' }); // 200 para evitar retries
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
