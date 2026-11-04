// Names only: not read by runs and deliberately outside the instrument. Each name is verdict-neutral
// because it becomes part of the slot path, and so of every rendered prompt; the expected verdict
// lives only in `labels/<name>.json`, which never enters a slot.
export const SCENARIOS = Object.freeze([
  'config-schema-documentation',
  'customer-batch-migration',
  'invoice-csv-export',
  'login-limiter-security-review',
  'monthly-revenue-report',
  'node-runtime-upgrade',
  'orders-pagination-review',
  'resume-previous-session',
  'role-change-audit-log',
  'staging-credential-rotation',
  'supplier-price-importer',
  'temporal-date-parsing',
  'typo-tolerant-search',
  'upload-test-timeout',
  'uploader-retry-tickets',
]);
