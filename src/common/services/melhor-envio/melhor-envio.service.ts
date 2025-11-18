/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NuvemshopService } from '../nuvemshop/nuvemshop.service';
import axios, { AxiosInstance } from 'axios';

export interface ShippingOption {
  id: number;
  name: string;
  price: string;
  delivery_time: number;
  delivery_range: {
    min: number;
    max: number;
  };
  company: {
    id: number;
    name: string;
    picture: string;
  };
  error?: string;
}

export interface CalculateShippingRequest {
  from: {
    postal_code: string;
  };
  to: {
    postal_code: string;
  };
  products: Array<{
    id: string;
    width: number;
    height: number;
    length: number;
    weight: number;
    insurance_value: number;
    quantity: number;
  }>;
}

@Injectable()
export class MelhorEnvioService {
  private readonly api: AxiosInstance;
  private readonly logger = new Logger(MelhorEnvioService.name);
  private readonly fromPostalCode: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly nuvemshopService: NuvemshopService,
  ) {
    const token = this.configService.get<string>('MELHOR_ENVIO_TOKEN');
    if (!token) {
      throw new Error('MELHOR_ENVIO_TOKEN is not defined');
    }

    this.fromPostalCode = this.configService.get<string>(
      'MELHOR_ENVIO_FROM_POSTAL_CODE',
      '01310100',
    );

    this.api = axios.create({
      baseURL: 'https://melhorenvio.com.br/api/v2/me',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'Aplicação (seu-email@exemplo.com)',
      },
      timeout: 10000,
    });
  }

  /**
   * Busca as dimensões do produto na Nuvemshop
   * Agora busca corretamente da estrutura de variants
   */
  private async getProductDimensions(
    productId: string | number,
    variantId?: number
  ): Promise<{
    width: number;
    height: number;
    length: number;
    weight: number;
  }> {
    try {
      const product = await this.nuvemshopService.get(Number(productId));

      // Encontra a variante específica ou usa a primeira
      let variant = product.variants?.[0];
      if (variantId && product.variants) {
        const foundVariant = product.variants.find((v: any) => Number(v.id) === Number(variantId));
        if (foundVariant) {
          variant = foundVariant;
        }
      }

      if (!variant) {
        this.logger.warn(`Nenhuma variante encontrada para o produto ${productId}`);
        return this.getDefaultDimensions();
      }

      // Extrai dimensões da variante (campos da Nuvemshop)
      const width = parseFloat(variant.width) || 0;
      const height = parseFloat(variant.height) || 0;
      const depth = parseFloat(variant.depth) || 0;
      const weight = parseFloat(variant.weight) || 0;

      // Valida se as dimensões são válidas
      if (width <= 0 || height <= 0 || depth <= 0 || weight <= 0) {
        this.logger.warn(
          `Dimensões inválidas para produto ${productId}: ${width}x${height}x${depth}cm, ${weight}kg`
        );
        return this.getDefaultDimensions();
      }

      this.logger.debug(
        `Dimensões do produto ${productId} (variante ${variant.id}): ${width}x${height}x${depth}cm, ${weight}kg`,
      );

      return {
        width: Number(width),
        height: Number(height),
        length: Number(depth), // Nuvemshop usa "depth" para profundidade
        weight: Number(weight),
      };
    } catch (error) {
      this.logger.error(
        `Erro ao buscar dimensões do produto ${productId}:`,
        error,
      );
      return this.getDefaultDimensions();
    }
  }

  /**
   * Retorna dimensões padrão de uma garrafa de vinho
   */
  private getDefaultDimensions() {
    return {
      width: 21,
      height: 33,
      length: 20,
      weight: 1.7,
    };
  }

  /**
   * Calcula o frete para o carrinho
   * Retorna apenas opções da Jadlog, ordenadas por preço DECRESCENTE (mais caro primeiro)
   */
  async calculateShipping(
    toPostalCode: string,
    products: Array<{
      id: string | number;
      quantity: number;
      weight?: number;
      price: number;
      variant_id?: number; // Adiciona variant_id para buscar dimensões corretas
    }>,
  ): Promise<ShippingOption[]> {
    try {
      // Sanitiza o CEP
      const cleanToPostalCode = toPostalCode.replace(/\D/g, '');
      if (cleanToPostalCode.length !== 8) {
        throw new BadRequestException('CEP inválido');
      }

      // Busca as dimensões de cada produto na Nuvemshop
      const productsWithDimensions = await Promise.all(
        products.map(async (product) => {
          const dimensions = await this.getProductDimensions(
            product.id,
            product.variant_id
          );
          
          return {
            id: String(product.id),
            width: dimensions.width,
            height: dimensions.height,
            length: dimensions.length,
            weight: product.weight || dimensions.weight,
            insurance_value: product.price,
            quantity: product.quantity,
          };
        }),
      );

      const payload: CalculateShippingRequest = {
        from: {
          postal_code: this.fromPostalCode,
        },
        to: {
          postal_code: cleanToPostalCode,
        },
        products: productsWithDimensions,
      };

      this.logger.log('Calculando frete:', JSON.stringify(payload, null, 2));

      const response = await this.api.post('/shipment/calculate', payload);

      // Filtra apenas Jadlog (id: 2) e remove opções com erro
      const jadlogOptions = (response.data as ShippingOption[]).filter(
        (option) => option.company.id === 2 && !option.error,
      );

      if (jadlogOptions.length === 0) {
        this.logger.warn('Nenhuma opção Jadlog disponível para este CEP');
        throw new BadRequestException(
          'Nenhuma opção de frete Jadlog disponível para este CEP'
        );
      }

      // Ordena por preço DECRESCENTE (mais caro primeiro)
      jadlogOptions.sort(
        (a, b) => parseFloat(b.price) - parseFloat(a.price),
      );

      this.logger.log(
        `Opções Jadlog encontradas (mais cara primeiro): ${jadlogOptions.map(o => `${o.name}: R$ ${o.price}`).join(', ')}`
      );

      return jadlogOptions;
    } catch (error: any) {
      this.logger.error(
        'Erro ao calcular frete:',
        error.response?.data || error.message,
      );

      if (error.response?.status === 401) {
        throw new BadRequestException(
          'Token do Melhor Envio inválido. Configure a variável MELHOR_ENVIO_TOKEN',
        );
      }

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        error.response?.data?.message ||
          'Erro ao calcular frete. Verifique o CEP e tente novamente.',
      );
    }
  }

  /**
   * Obtém a opção de frete MAIS CARA da Jadlog
   */
  /**
   * Obtém a opção de frete MAIS CARA da Jadlog
   */
  async getMostExpensiveShipping(
    toPostalCode: string,
    products: Array<{
      id: string | number;
      quantity: number;
      weight?: number;
      price: number;
      variant_id?: number;
    }>,
  ): Promise<ShippingOption | null> {
    const options = await this.calculateShipping(toPostalCode, products);
    // Como já está ordenado do mais caro para o mais barato, retorna o primeiro
    return options.length > 0 ? options[0] : null;
  }

  /**
   * Mantém o método antigo para compatibilidade (retorna mais barato)
   */
  async getCheapestShipping(
    toPostalCode: string,
    products: Array<{
      id: string | number;
      quantity: number;
      weight?: number;
      price: number;
      variant_id?: number;
    }>,
  ): Promise<ShippingOption | null> {
    const options = await this.calculateShipping(toPostalCode, products);
    if (options.length === 0) return null;
    
    // Reordena para encontrar o mais barato
    const cheapest = [...options].sort(
      (a, b) => parseFloat(a.price) - parseFloat(b.price)
    )[0];
    
    return cheapest;
  }
}