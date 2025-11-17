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

  constructor(private readonly configService: ConfigService) {
    const token = this.configService.get<string>('MELHOR_ENVIO_TOKEN');
    if (!token) {
      throw new Error('MELHOR_ENVIO_TOKEN is not defined');
    }

    this.fromPostalCode = this.configService.get<string>(
      'MELHOR_ENVIO_FROM_POSTAL_CODE',
      '01310100', // CEP padrão - ajuste para o seu
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
   * Calcula o frete para o carrinho
   */
  async calculateShipping(
    toPostalCode: string,
    products: Array<{
      id: string | number;
      quantity: number;
      weight?: number; // em kg
      price: number;
    }>,
  ): Promise<ShippingOption[]> {
    try {
      // Sanitiza o CEP
      const cleanToPostalCode = toPostalCode.replace(/\D/g, '');
      if (cleanToPostalCode.length !== 8) {
        throw new BadRequestException('CEP inválido');
      }

      // Prepara os produtos para a API do Melhor Envio
      const productsPayload = products.map((product) => ({
        id: String(product.id),
        width: 10, // cm - ajuste conforme seus produtos
        height: 30, // cm - altura de uma garrafa de vinho
        length: 10, // cm - ajuste conforme seus produtos
        weight: product.weight || 1.5, // kg - peso padrão de uma garrafa
        insurance_value: product.price,
        quantity: product.quantity,
      }));

      const payload: CalculateShippingRequest = {
        from: {
          postal_code: this.fromPostalCode,
        },
        to: {
          postal_code: cleanToPostalCode,
        },
        products: productsPayload,
      };

      this.logger.log('Calculando frete:', JSON.stringify(payload, null, 2));

      const response = await this.api.post('/shipment/calculate', payload);

      // Filtra apenas Jadlog (id: 2) e remove opções com erro
      const jadlogOptions = (response.data as ShippingOption[]).filter(
        (option) => option.company.id === 2 && !option.error,
      );

      if (jadlogOptions.length === 0) {
        this.logger.warn('Nenhuma opção Jadlog disponível para este CEP');
        // Retorna todas as opções disponíveis como fallback
        return (response.data as ShippingOption[]).filter(
          (option) => !option.error,
        );
      }

      // Ordena por preço (mais barato primeiro)
      jadlogOptions.sort(
        (a, b) => parseFloat(a.price) - parseFloat(b.price),
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

      throw new BadRequestException(
        error.response?.data?.message ||
          'Erro ao calcular frete. Verifique o CEP e tente novamente.',
      );
    }
  }

  /**
   * Obtém a opção de frete mais barata
   */
  async getCheapestShipping(
    toPostalCode: string,
    products: Array<{
      id: string | number;
      quantity: number;
      weight?: number;
      price: number;
    }>,
  ): Promise<ShippingOption | null> {
    const options = await this.calculateShipping(toPostalCode, products);
    return options.length > 0 ? options[0] : null;
  }
}