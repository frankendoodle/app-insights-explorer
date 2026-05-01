import { ApiKeyGuard } from './api-key.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new ApiKeyGuard(reflector);
    process.env.BACKEND_API_SECRET = 'test-api-key';
  });

  const mockContext = (apiKey?: string, isPublic = false): ExecutionContext => {
    const handler = jest.fn();
    const classRef = jest.fn();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(isPublic);
    return {
      switchToHttp: () => ({
        getRequest: () => ({ headers: { 'x-api-key': apiKey } }),
      }),
      getHandler: () => handler,
      getClass: () => classRef,
    } as unknown as ExecutionContext;
  };

  it('allows public routes without an API key', () => {
    const ctx = mockContext(undefined, true);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows requests with the correct API key', () => {
    const ctx = mockContext('test-api-key');
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('throws UnauthorizedException for a wrong API key', () => {
    const ctx = mockContext('wrong-key');
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when API key is missing', () => {
    const ctx = mockContext(undefined);
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
});
