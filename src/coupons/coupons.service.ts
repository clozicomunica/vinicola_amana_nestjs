/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// src/coupons/coupons.service.ts
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { NuvemshopService } from '../common/services/nuvemshop/nuvemshop.service';
import { Coupon } from '../common/services/nuvemshop/nuvemshop.service'; // Importe o interface completo

@Injectable()
export class CouponsService {
  constructor(private readonly nuvemshopService: NuvemshopService) {}

  async validateCoupon(code: string): Promise<Coupon> {
    const params = { q: code, valid: true };
    const coupons: Coupon[] = await this.nuvemshopService.fetchCoupons(params);
    if (coupons.length === 0) {
      throw new HttpException(
        'Cupom inválido ou expirado.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const coupon = coupons[0];
    if (coupon.max_uses !== null && coupon.used >= coupon.max_uses) {
      throw new HttpException(
        'Cupom atingiu o limite de usos.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return coupon;
  }
}
