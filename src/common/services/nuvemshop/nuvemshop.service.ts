import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';
import { AuthService } from '../../../auth/auth.service';
import { IListProduct } from '../../../products/products.service';

interface CategoryName {
  pt: string;
}

interface Category {
  name: CategoryName;
}

interface Variant {
  price: string;
}

export interface Product {
  id: string;
  categories?: Category[];
  region?: string;
  variants?: Variant[];
  // Additional fields can be added as per API response
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
  number: string;
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
  // Add more optional fields as needed
}

@Injectable()
export class NuvemshopService {
  private readonly api: AxiosInstance;

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

  async fetchProducts(params: IListProduct): Promise<Product[]> {
    const response: AxiosResponse<Product[]> = await this.api.get('/products', {
      params,
    });
    return response.data;
  }

  async fetchProductById(id: string): Promise<Product | null> {
    try {
      const response: AxiosResponse<Product> = await this.api.get(
        `/products/${id}`,
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
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

  async createOrder(payload: CreateOrderPayload): Promise<unknown> {
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
    };

    const response: AxiosResponse<unknown> = await this.api.post(
      '/orders',
      formattedPayload,
    );

    return response.data;
  }
}
