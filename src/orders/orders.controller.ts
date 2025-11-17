/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { OrdersService } from './orders.service';

export interface CreateCheckoutBody {
  produtos: Array<{
    quantity: number;
    variant_id: number;
  }>;
  cliente: {
    name: string;
    email: string;
    document: string;
    address: string;
    city: string;
    state: string;
    zipcode: string;
    complement: string;
  };
  couponCode?: string;
}

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('create-checkout')
  async createCheckout(@Body() body: CreateCheckoutBody) {
    try {
      return await this.ordersService.createCheckout(body);
    } catch (e) {
      console.error('Erro create-checkout:', e);
      throw new HttpException(
        'Erro ao criar checkout',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':id')
  async getOrderById(@Param('id') id: string) {
    return await this.ordersService.getOrderById(id);
  }
}
