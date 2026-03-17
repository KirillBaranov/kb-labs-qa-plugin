/**
 * QA Plugin configuration.
 * Stored in kb.config.json → profiles[].products.qa
 */
export interface QAPluginConfig {
  /** Package categories for grouped reporting */
  categories?: Record<string, CategoryConfig>;
}

/**
 * Configuration for a single package category.
 */
export interface CategoryConfig {
  /** Display name (defaults to category key if not set) */
  label?: string;
  /** Package name patterns: exact name, glob ("@kb-labs/core-*"), or repo prefix ("kb-labs-cli/*") */
  packages: string[];
}
