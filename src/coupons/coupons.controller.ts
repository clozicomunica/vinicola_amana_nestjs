/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { CouponsService } from './coupons.service';

interface ValidateCouponDto {
  code: string;
}

@Controller('coupons')
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Post('validate')
  async validate(@Body() dto: ValidateCouponDto) {
    try {
      const coupon = await this.couponsService.validateCoupon(
        dto.code.toUpperCase(),
      );
      return {
        valid: true,
        id: coupon.id,
        type: coupon.type,
        value: parseFloat(coupon.value),
        minPrice: coupon.min_price ? parseFloat(coupon.min_price) : 0,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Erro ao validar cupom.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
