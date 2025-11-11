import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import {
  NuvemshopService,
  CreateOrderPayload,
  Product,
} from '../common/services/nuvemshop/nuvemshop.service';

export interface IListProduct {
  page?: number;
  per_page?: number;
  published?: boolean;
  category?: string;
  search?: string;
}

interface CheckoutBody {
  items: Array<{ variant_id: number; quantity: number; price?: number }>;
  customer: { email?: string; name?: string; document?: string };
}

@Injectable()
export class ProductsService {
  constructor(private nuvemshopService: NuvemshopService) {}

  async listProducts(query: IListProduct): Promise<Product[]> {
    return await this.nuvemshopService.fetchProducts(query);
  }

  async getProductById(id: string): Promise<Product | null> {
    return await this.nuvemshopService.fetchProductById(id);
  }

  async getSimilarProducts(id: string): Promise<Product[]> {
    const current: Product | null =
      await this.nuvemshopService.fetchProductById(id);
    if (!current) {
      throw new NotFoundException('Product not found');
    }
    const all: Product[] = await this.nuvemshopService.fetchProducts({
      page: 1,
      per_page: 50,
      published: true,
    });
    const others: Product[] = all.filter((p: Product) => p.id !== current.id);
    const cat: string | undefined = current.categories?.[0]?.name?.pt;
    const reg: string | undefined = current.region;
    const price: number = parseFloat(current.variants?.[0]?.price ?? '0') || 0;
    let similares: Product[] = others.filter((p: Product) => {
      const pCat: string | undefined = p.categories?.[0]?.name?.pt;
      const pReg: string | undefined = p.region;
      const pPrice: number = parseFloat(p.variants?.[0]?.price ?? '0') || 0;
      const sameCat: boolean = pCat === cat;
      const sameReg: boolean = !!reg && pReg === reg;
      const similarPrice: boolean = Math.abs(price - pPrice) <= price * 0.3;
      return sameCat && (sameReg || similarPrice);
    });
    if (similares.length === 0) {
      similares = others.filter(
        (p: Product) => p.categories?.[0]?.name?.pt === cat,
      );
    }
    if (similares.length === 0) {
      similares = others;
    }
    return similares.slice(0, 6);
  }

  async checkoutOrder(body: CheckoutBody): Promise<unknown> {
    const { items, customer } = body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new BadRequestException('Items required');
    }
    const [firstName = 'Cliente', ...lastNameParts] = (
      customer.name ?? 'Cliente Anônimo'
    ).split(' ');
    const lastName = lastNameParts.join(' ') || 'Anônimo';
    const defaultAddress = {
      first_name: firstName,
      last_name: lastName,
      address: 'Não informado',
      number: 'Não informado',
      city: 'Não informado',
      province: 'Não informado',
      zipcode: '00000-000',
      country: 'BR',
    };
    const payload: CreateOrderPayload = {
      customer: {
        email: customer.email ?? 'cliente@example.com',
        name: customer.name ?? 'Cliente Anônimo',
        document: customer.document ?? '00000000000',
      },
      products: items.map((item) => ({
        variant_id: item.variant_id,
        quantity: item.quantity ?? 1,
        price: item.price,
      })),
      billing_address: defaultAddress,
      shipping_address: defaultAddress,
      gateway: 'not-provided',
      shipping_pickup_type: 'ship',
      shipping_cost_customer: 0,
    };
    return this.nuvemshopService.createOrder(payload);
  }
}
