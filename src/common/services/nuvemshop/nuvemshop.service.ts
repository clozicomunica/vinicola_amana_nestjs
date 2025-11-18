/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable prefer-const */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';
import { AuthService } from '../../../auth/auth.service';

interface CategoryName {
  pt: string;
}

interface Category {
  name: CategoryName;
}

interface VariantValue {
  pt: string;
}

interface Variant {
  price: string;
  values: VariantValue[];
}

export interface Product {
  id: string;
  categories?: Category[];
  region?: string;
  variants?: Variant[];
  width?: number;
  height?: number;
  length?: number;
  weight?: number;
  dimensions?: {
    width?: number;
    height?: number;
    length?: number;
  };
}

interface Customer {
  email: string;
  name: string;
  document: string;
}

interface Address {
  first_name: string;
  last_name: string;
  address: string;
  number: number | string;
  floor?: string;
  locality?: string;
  city: string;
  province: string;
  zipcode: string;
  country: string;
  phone?: string;
}

interface ProductItem {
  variant_id: number;
  quantity: number;
  price?: number;
}

export interface CreateOrderPayload {
  customer: Customer;
  products: ProductItem[];
  billing_address?: Partial<Address>;
  shipping_address?: Partial<Address>;
  gateway?: string;
  shipping_pickup_type?: string;
  shipping?: string;
  shipping_option?: string;
  shipping_cost_customer?: number;
  payment_status?: string;
  note?: string; // Mantido como obrigatório, conforme erro
}

export interface Coupon {
  // Expandido com todas as propriedades da API
  id: string;
  code: string;
  type: 'percentage' | 'absolute' | 'shipping';
  value: string;
  valid?: boolean;
  used: number;
  max_uses: number | null;
  includes_shipping?: boolean;
  start_date?: string | null;
  start_time?: string | null;
  end_date?: string | null;
  end_time?: string | null;
  min_price: string | null;
  categories?: any[] | null;
  products?: any[] | null;
  first_consumer_purchase?: boolean;
  max_uses_per_client?: number | null;
  is_deleted?: boolean;
  combines_with_other_discounts?: boolean;
  only_cheapest_shipping?: boolean;
  max_discount_amount?: number | null;
}

@Injectable()
export class NuvemshopService {
  private readonly api: AxiosInstance;
  private readonly categoryMap: Record<string, number> = {
    tinto: 31974513,
    branco: 31974513,
    rose: 31974513,
    rosé: 31974513,
    amana: 31974539,
    una: 31974540,
    singular: 32613020,
    cafe: 31974516,
    'em grao': 31974553,
    'em po': 31974549,
    diversos: 31974526,
    experiencias: 31974528,
    'vale-presente': 31974530,
  };

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {
    const storeId = this.configService.get<string>('NUVEMSHOP_STORE_ID');
    if (!storeId) {
      throw new Error('NUVEMSHOP_STORE_ID is not defined');
    }

    this.api = axios.create({
      baseURL: `https://api.tiendanube.com/v1/${storeId}`,
      headers: {
        'User-Agent': this.configService.get<string>(
          'NUVEMSHOP_USER_AGENT',
          'Nuvemshop API Client',
        ),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 10000,
    });

    this.api.interceptors.request.use(async (config) => {
      const token = await this.authService.getValidAccessToken();
      config.headers.Authentication = `bearer ${token}`;
      return config;
    });

    this.api.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response) {
          throw new BadRequestException(
            `API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`,
          );
        }
        throw error;
      },
    );
  }

  async getOrderById(idNuvemShop: any): Promise<any> {
    const result = await this.api.get(`/orders/${idNuvemShop}`);

    return result.data;
  }

  async get(idProduto: number): Promise<any> {
    const result = await this.api.get(`/products/${idProduto}`);

    return result.data;
  }

  private cleanString(str: string): string {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  async fetchProducts(query: {
    page?: number;
    per_page?: number;
    published?: boolean;
    category?: string;
    search?: string;
  }): Promise<Product[]> {
    let params: any = {
      page: query.page,
      per_page: query.per_page,
      published: true,
    };

    const categoryLower = query.category
      ? this.cleanString(query.category)
      : null;
    const isWineType =
      categoryLower &&
      ['tinto', 'branco', 'rose', 'rosé'].includes(categoryLower);

    if (categoryLower && this.categoryMap[categoryLower]) {
      if (!isWineType) {
        params.category_id = this.categoryMap[categoryLower];
      } else {
        params.category_id = 31974513; // Categoria pai para vinhos
      }
    }

    if (query.search) {
      params.q = query.search;
    }

    const response = await this.api.get('/products', { params });
    let products = response.data;

    if (isWineType) {
      const normalizedType = categoryLower;
      products = products.filter((product: Product) =>
        product.variants?.some((variant) =>
          variant.values.some(
            (value) => this.cleanString(value.pt) === normalizedType,
          ),
        ),
      );
    }

    return products;
  }

  async fetchProductById(productId: string): Promise<Product | null> {
    try {
      const response = await this.api.get(`/products/${productId}`);
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async getSimilarProducts(productId: string): Promise<Product[]> {
    const currentProduct = await this.fetchProductById(productId);
    if (!currentProduct) {
      throw new NotFoundException('Produto não encontrado');
    }

    const allProducts = await this.fetchProducts({
      page: 1,
      per_page: 50,
      published: true,
    });

    const outrosProdutos = allProducts.filter(
      (p) => p.id !== currentProduct.id,
    );

    const categoriaAtual = currentProduct.categories?.[0]?.name?.pt;
    const regiaoAtual = currentProduct.region;
    const precoAtual =
      parseFloat(currentProduct.variants?.[0]?.price || '0') || 0;

    let similares = outrosProdutos.filter((p) => {
      const categoriaProduto = p.categories?.[0]?.name?.pt;
      const regiaoProduto = p.region;
      const precoProduto = parseFloat(p.variants?.[0]?.price || '0') || 0;

      const mesmaCategoria = categoriaProduto === categoriaAtual;
      const mesmaRegiao =
        regiaoAtual && regiaoProduto && regiaoProduto === regiaoAtual;
      const precoSimilar =
        Math.abs(precoAtual - precoProduto) <= precoAtual * 0.3;

      return mesmaCategoria && (mesmaRegiao || precoSimilar);
    });

    if (similares.length === 0) {
      similares = outrosProdutos.filter((p) => {
        const categoriaProduto = p.categories?.[0]?.name?.pt;
        return categoriaProduto === categoriaAtual;
      });
    }

    if (similares.length === 0) {
      similares = outrosProdutos;
    }

    return similares.slice(0, 6);
  }

  async createOrder(payload: CreateOrderPayload): Promise<any> {
    const defaultAddress: Address = {
      first_name: payload.customer.name.split(' ')[0] || 'Não informado',
      last_name:
        payload.customer.name.split(' ').slice(1).join(' ') || 'Não informado',
      address: 'Não informado',
      number: 'Não informado',
      city: 'Não informado',
      province: 'Não informado',
      zipcode: '0000',
      country: 'BR',
    };

    const formattedPayload = {
      ...payload,
      gateway: payload.gateway || 'not-provided',
      shipping_pickup_type: payload.shipping_pickup_type || 'pickup',
      shipping: payload.shipping || 'Não informado',
      shipping_option: payload.shipping_option || 'Não informado',
      shipping_cost_customer: payload.shipping_cost_customer ?? 0,
      billing_address: { ...defaultAddress, ...payload.billing_address },
      shipping_address: { ...defaultAddress, ...payload.shipping_address },
      payment_status: payload.payment_status || 'pending',
    };

    const response: AxiosResponse<any> = await this.api.post(
      '/orders',
      formattedPayload,
    );

    return response.data;
  }
 async updateOrderToPaid(orderId: string | number): Promise<any> {
  try {
    console.log('========================================');
    console.log(`[NuvemShop] 🔄 Iniciando atualização do pedido ${orderId}...`);
    
    // Primeiro, busca o pedido atual
    let currentOrder;
    try {
      currentOrder = await this.api.get(`/orders/${orderId}`);
      console.log(`[NuvemShop] 📦 Pedido encontrado! Status atual: "${currentOrder.data.payment_status}"`);
    } catch (err: any) {
      console.error(`[NuvemShop] ❌ Erro ao buscar pedido ${orderId}:`, {
        status: err?.response?.status,
        message: err?.message,
        data: err?.response?.data,
      });
      throw new Error(`Pedido ${orderId} não encontrado na Nuvemshop`);
    }
    
    // Se já estiver pago, não faz nada
    if (currentOrder.data.payment_status === 'paid') {
      console.log(`[NuvemShop] ✅ Pedido ${orderId} já está como PAID. Nada a fazer.`);
      return {
        ...currentOrder.data,
        already_paid: true,
      };
    }
    
    // Atualiza o status do pagamento para PAID
    const payload = {
      payment_status: 'paid',
    };
    
    console.log(`[NuvemShop] 📤 Enviando atualização para a Nuvemshop...`);
    console.log(`[NuvemShop] Payload:`, JSON.stringify(payload, null, 2));
    
    const response = await this.api.put(`/orders/${orderId}`, payload);
    
    console.log(`[NuvemShop] ✅✅✅ Pedido ${orderId} atualizado com SUCESSO!`);
    console.log(`[NuvemShop] Novo status: "${response.data.payment_status}"`);
    console.log(`[NuvemShop] Resposta completa:`, JSON.stringify(response.data, null, 2));
    console.log('========================================');
    
    return response.data;
  } catch (err: any) {
    console.error('========================================');
    console.error(`[NuvemShop] ❌❌❌ ERRO CRÍTICO ao atualizar pedido ${orderId}:`);
    console.error('[NuvemShop] Status HTTP:', err?.response?.status);
    console.error('[NuvemShop] Status Text:', err?.response?.statusText);
    console.error('[NuvemShop] Erro da API:', JSON.stringify(err?.response?.data, null, 2));
    console.error('[NuvemShop] Mensagem:', err?.message);
    console.error('[NuvemShop] Headers da requisição:', err?.config?.headers);
    console.error('========================================');
    throw err;
  }
}

  async fetchCoupons(params: any): Promise<Coupon[]> {
    const response = await this.api.get('/coupons', { params });
    return response.data;
  }
}
