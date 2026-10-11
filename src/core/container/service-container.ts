
export interface ServiceToken<T> {
  readonly key: string;
  readonly __type?: T;
}

export function createServiceToken<T>(
  key: string,
): ServiceToken<T> {
  return { key };
}

export class ServiceContainer {
  private readonly services = new Map<string, unknown>();

  register<T>(token: ServiceToken<T>, service: T): void {
    if (this.services.has(token.key)) {
      throw new Error(`Service already registered: ${token.key}`);
    }

    this.services.set(token.key, service);
  }

  get<T>(token: ServiceToken<T>): T {
    if (!this.services.has(token.key)) {
      throw new Error(`Service not found: ${token.key}`);
    }

    return this.services.get(token.key) as T;
  }

  has<T>(token: ServiceToken<T>): boolean {
    return this.services.has(token.key);
  }
}
