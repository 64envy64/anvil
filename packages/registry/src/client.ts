/**
 * Registry HTTP Client
 *
 * Communicates with the Anvil registry API (self-hosted hub).
 * Falls back to local storage for offline/development workflows.
 */

import type {
  Registry,
  RegistryPackage,
  PublishRequest,
  SearchQuery,
  SearchResult,
  RegistryVersion,
} from './types.js';

const DEFAULT_REGISTRY = 'http://localhost:4400/api/v1';

export interface RegistryClientOptions {
  /** Registry API base URL */
  registry?: string;
  /** Auth token for publish operations */
  token?: string;
}

export class RegistryClient implements Registry {
  private baseUrl: string;
  private token?: string;

  constructor(options: RegistryClientOptions = {}) {
    this.baseUrl = (options.registry ?? DEFAULT_REGISTRY).replace(/\/$/, '');
    this.token = options.token;
  }

  async publish(req: PublishRequest, token?: string): Promise<RegistryPackage> {
    const authToken = token ?? this.token;
    if (!authToken) {
      throw new Error('Authentication required for publish. Run: anvil login');
    }

    const res = await fetch(`${this.baseUrl}/packages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify(req),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Publish failed (${res.status}): ${body}`);
    }

    return res.json() as Promise<RegistryPackage>;
  }

  async search(query: SearchQuery): Promise<SearchResult> {
    const params = new URLSearchParams();
    if (query.query) params.set('q', query.query);
    if (query.tags) params.set('tags', query.tags.join(','));
    if (query.sort) params.set('sort', query.sort);
    if (query.page) params.set('page', String(query.page));
    if (query.per_page) params.set('per_page', String(query.per_page));

    const res = await fetch(`${this.baseUrl}/search?${params}`);
    if (!res.ok) {
      throw new Error(`Search failed (${res.status})`);
    }
    return res.json() as Promise<SearchResult>;
  }

  async get(name: string, version?: string): Promise<RegistryPackage | null> {
    const url = version
      ? `${this.baseUrl}/packages/${encodeURIComponent(name)}/versions/${version}`
      : `${this.baseUrl}/packages/${encodeURIComponent(name)}`;

    const res = await fetch(url);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Get failed (${res.status})`);
    return res.json() as Promise<RegistryPackage>;
  }

  async getDefinition(name: string, version?: string): Promise<string | null> {
    const v = version ? `/versions/${version}` : '';
    const res = await fetch(`${this.baseUrl}/packages/${encodeURIComponent(name)}${v}/definition`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Get definition failed (${res.status})`);
    return res.text();
  }

  async versions(name: string): Promise<RegistryVersion[]> {
    const res = await fetch(`${this.baseUrl}/packages/${encodeURIComponent(name)}/versions`);
    if (!res.ok) throw new Error(`Versions failed (${res.status})`);
    const data = await res.json() as { versions: RegistryVersion[] };
    return data.versions;
  }
}
