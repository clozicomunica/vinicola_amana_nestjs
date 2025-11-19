import { Controller, Get, Query } from '@nestjs/common';
import { AuthService } from './auth.service';
import axios from 'axios';

interface CallbackQuery {
  code?: string;
  store_id?: string;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  user_id: string;
  refresh_token?: string;
  expires_in?: number;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('callback')
  async callback(@Query() query: CallbackQuery) {
    const { code, store_id } = query;

    if (!code || !store_id) {
      throw new Error('⚠️ Parâmetros ausentes: "code" ou "store_id"');
    }

    const tokenUrl = 'https://www.tiendanube.com/apps/authorize/token';

    const redirectUri = process.env.NUVEMSHOP_REDIRECT_URI;

    const params = {
      client_id: process.env.NUVEMSHOP_CLIENT_ID,
      client_secret: process.env.NUVEMSHOP_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    };

    const { data } = await axios.post<TokenResponse>(tokenUrl, null, {
      params,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const tokenData = {
      store_id,
      access_token: data.access_token,
      refresh_token: data.refresh_token || '',
      token_type: data.token_type,
      scope: data.scope,
      user_id: data.user_id,
      created_at: new Date().toISOString(),
      expires_at: data.expires_in || 4 * 60 * 60, // padrão: 4h
    };

    await this.authService.saveTokens(tokenData);

    return `✅ Loja ${store_id} autorizada com sucesso! Tokens salvos.`;
  }
}
