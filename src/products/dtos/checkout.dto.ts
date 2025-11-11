import { IsArray, ValidateNested, IsObject } from 'class-validator';
import { Type } from 'class-transformer';

class CheckoutItem {
  variant_id: number;
  quantity: number;
}

class CheckoutCustomer {
  email?: string;
  name?: string;
  document?: string;
}

export class CheckoutDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CheckoutItem)
  items: CheckoutItem[];

  @IsObject()
  @ValidateNested()
  @Type(() => CheckoutCustomer)
  customer: CheckoutCustomer;
}
