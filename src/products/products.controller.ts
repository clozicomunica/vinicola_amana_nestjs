import {
  Controller,
  Get,
  Param,
  Query,
  Post,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { ListProductsDto } from './dtos/list-products.dto';
import { CheckoutDto } from './dtos/checkout.dto';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  async listProducts(@Query() query: ListProductsDto) {
    try {
      return await this.productsService.listProducts(query);
    } catch (err) {
      throw new HttpException(
        (err as Error).message || 'Erro ao listar produtos',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':id')
  async getProductById(@Param('id') id: string) {
    const product = await this.productsService.getProductById(id);
    if (!product) {
      throw new HttpException('Produto não encontrado', HttpStatus.NOT_FOUND);
    }
    return product;
  }

  @Get(':id/similares')
  async getSimilarProducts(@Param('id') id: string) {
    return await this.productsService.getSimilarProducts(id);
  }

  @Post('checkout')
  async checkout(@Body() body: CheckoutDto) {
    try {
      return await this.productsService.checkoutOrder(body);
    } catch (err) {
      throw new HttpException(
        (err as Error).message || 'Erro ao criar pedido',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
