import type { Request, Response } from 'express';

import type { AuthUser, ChangePasswordInput, LoginInput } from './auth.schema.js';
import {
  clearSessionCookie,
  currentAuth,
  sessionToken,
  setSessionCookie,
} from './auth.middleware.js';
import { authService } from './auth.service.js';

/** HTTP ↔ auth service: sets and clears the session cookie. */
export class AuthController {
  constructor(private readonly service = authService) {}

  readonly login = async (body: LoginInput, req: Request, res: Response): Promise<AuthUser> => {
    const result = await this.service.login(body, {
      ip: req.ip ?? '',
      userAgent: req.get('user-agent') ?? '',
    });
    setSessionCookie(res, result.token, result.persistent, result.expiresAt);
    return result.user;
  };

  readonly logout = async (req: Request, res: Response): Promise<void> => {
    const token = sessionToken(req);
    if (token) {
      await this.service.logout(token);
    }
    clearSessionCookie(res);
  };

  readonly me = (res: Response): Promise<AuthUser> => Promise.resolve(currentAuth(res).user);

  readonly changePassword = (body: ChangePasswordInput, res: Response): Promise<AuthUser> =>
    this.service.changePassword(currentAuth(res), body);
}

export const authController = new AuthController();
