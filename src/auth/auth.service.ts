import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import axios from 'axios';

interface Tokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}
interface RefreshResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

@Injectable()
export class AuthService {
  private TOKEN_FILE = path.join(__dirname, '../../tokens.json');

  async readTokens(): Promise<Tokens> {
    return JSON.parse(await fs.readFile(this.TOKEN_FILE, 'utf-8')) as Tokens;
  }

  async saveTokens(tokens: Tokens): Promise<void> {
    await fs.writeFile(this.TOKEN_FILE, JSON.stringify(tokens, null, 2));
  }

  private isTokenExpired(expires_at: number): boolean {
    return Date.now() >= expires_at;
  }

  private async refreshAccessToken(refresh_token: string): Promise<Tokens> {
    const { data } = await axios.post<RefreshResponse>(
      'https://www.tiendanube.com/apps/authorize/token',
      null,
      {
        params: {
          client_id: process.env.NUVEMSHOP_CLIENT_ID,
          client_secret: process.env.NUVEMSHOP_CLIENT_SECRET,
          grant_type: 'refresh_token',
          refresh_token,
        },
        headers: {
          'User-Agent': process.env.NUVEMSHOP_USER_AGENT,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );
    const expires_at = Date.now() + data.expires_in * 1000;
    const newTokens: Tokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at,
    };
    await this.saveTokens(newTokens);
    return newTokens;
  }

  async getValidAccessToken(): Promise<string> {
    const tokens = await this.readTokens();
    return this.isTokenExpired(tokens.expires_at)
      ? (await this.refreshAccessToken(tokens.refresh_token)).access_token
      : tokens.access_token;
  }
}
