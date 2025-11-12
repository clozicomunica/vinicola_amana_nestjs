// src/orders/orders.service.ts
// Atualizado: Removido createOrder antes do MP, para matching com Express (use webhook)
import { Injectable } from '@nestjs/common';
import { MercadoPagoService } from '../common/services/mercado-pago/mercado-pago.service';

interface Produto {
  name: string;
  quantity: number;
  price: number;
  variant_id: number;
  idProduto: string;
}

interface Cliente {
  name: string;
  email: string;
  document: string;
  address: string;
  city: string;
  state: string;
  zipcode: string;
  complement: string;
}

interface CreateCheckoutBody {
  produtos: Produto[];
  cliente: Cliente;
  total: number;
}

@Injectable()
export class OrdersService {
  constructor(private readonly mercadoPagoService: MercadoPagoService) {}

  async createCheckout(body: CreateCheckoutBody) {
    // Removido createOrder aqui; movido para webhook pós-pagamento
    return this.mercadoPagoService.createCheckout(body);
  }
}
