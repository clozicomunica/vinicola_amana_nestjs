import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { OrdersService } from './orders.service';

interface CreateCheckoutBody {
  produtos: Array<{
    name: string;
    quantity: number;
    price: number;
    variant_id: number;
    idProduto: string;
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
  total: number;
}

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('create-checkout')
  async createCheckout(@Body() body: CreateCheckoutBody) {
    try {
      const result = await this.ordersService.createCheckout(body);
      return result;
    } catch (e) {
      console.log(e);
      const message = 'Erro ao criar checkout';
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
