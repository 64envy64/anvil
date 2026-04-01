/**
 * Registry API Types
 *
 * Defines the contract for the Anvil tool registry (self-hosted hub).
 * Both the hosted registry and local file-based store implement this interface.
 */

export interface RegistryPackage {
  /** Scoped package name: @scope/tool-name or tool-name */
  name: string;
  /** Latest version */
  version: string;
  /** Short description */
  description: string;
  /** All published versions */
  versions: RegistryVersion[];
  /** Author info */
  author: RegistryAuthor;
  /** Tool count in this package */
  tool_count: number;
  /** Target outputs available */
  targets: string[];
  /** Tags for discovery */
  tags: string[];
  /** NPM-style download counts */
  downloads: { weekly: number; total: number };
  /** Timestamps */
  created_at: string;
  updated_at: string;
  /** Repository URL */
  repository?: string;
  /** License */
  license?: string;
}

export interface RegistryVersion {
  version: string;
  anvil_version: string;
  tool_names: string[];
  published_at: string;
  /** SHA-256 of the published tarball */
  integrity: string;
}

export interface RegistryAuthor {
  name: string;
  email?: string;
  url?: string;
}

export interface PublishRequest {
  /** Package name */
  name: string;
  /** Version to publish */
  version: string;
  /** The .anvil.yaml content */
  definition: string;
  /** README content */
  readme?: string;
  /** Repository URL */
  repository?: string;
  /** Tags */
  tags?: string[];
  /** License identifier */
  license?: string;
}

export interface SearchQuery {
  query?: string;
  tags?: string[];
  sort?: 'relevance' | 'downloads' | 'updated' | 'created';
  page?: number;
  per_page?: number;
}

export interface SearchResult {
  packages: RegistryPackage[];
  total: number;
  page: number;
  per_page: number;
}

/**
 * Registry interface — implemented by both hosted and local backends.
 */
export interface Registry {
  publish(req: PublishRequest, token: string): Promise<RegistryPackage>;
  search(query: SearchQuery): Promise<SearchResult>;
  get(name: string, version?: string): Promise<RegistryPackage | null>;
  getDefinition(name: string, version?: string): Promise<string | null>;
  versions(name: string): Promise<RegistryVersion[]>;
}
