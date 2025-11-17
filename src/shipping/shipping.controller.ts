/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable prettier/prettier */
import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { MelhorEnvioService } from '../common/services/melhor-envio/melhor-envio.service';

export interface CalculateShippingDto {
  zipcode: string;
  products: Array<{
    id: string | number;
    quantity: number;
    price: number;
    weight?: number; // em kg
  }>;
}

@Controller('shipping')
export class ShippingController {
  constructor(private readonly melhorEnvioService: MelhorEnvioService) {}

  @Post('calculate')
  async calculateShipping(@Body() body: CalculateShippingDto) {
    try {
      const options = await this.melhorEnvioService.calculateShipping(
        body.zipcode,
        body.products,
      );

      return {
        success: true,
        options,
      };
    } catch (error: any) {
      throw new HttpException(
        error.message || 'Erro ao calcular frete',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('cheapest')
  async getCheapestShipping(@Body() body: CalculateShippingDto) {
    try {
      const option = await this.melhorEnvioService.getCheapestShipping(
        body.zipcode,
        body.products,
      );

      if (!option) {
        throw new HttpException(
          'Nenhuma opção de frete disponível para este CEP',
          HttpStatus.NOT_FOUND,
        );
      }

      return {
        success: true,
        option,
      };
    } catch (error: any) {
      throw new HttpException(
        error.message || 'Erro ao calcular frete',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}