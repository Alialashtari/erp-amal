/**
 * Minimal, safe template renderer for notification templates.
 * Syntax: {{variableName}} with dot paths. Unknown variables render as empty
 * strings. Only own properties are read (no prototype-chain access), and
 * nothing is ever executed.
 */
export function renderTemplate(template: string, data: Record<string, unknown> = {}): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_match, key: string) => {
    const value = key.split('.').reduce<unknown>((acc, part) => {
      if (acc === null || typeof acc !== 'object') return undefined;
      if (!Object.prototype.hasOwnProperty.call(acc, part)) return undefined;
      return (acc as Record<string, unknown>)[part];
    }, data);
    if (value === undefined || value === null || typeof value === 'function') return '';
    return typeof value === 'object' ? '' : String(value);
  });
}
