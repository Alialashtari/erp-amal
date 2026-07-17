import { renderTemplate } from './template.renderer';

describe('Notification template renderer (FRS-009 templates)', () => {
  it('substitutes placeholders', () => {
    expect(renderTemplate('Hello {{name}}, thank you for {{amount}} IQD', { name: 'Ali', amount: 50000 }))
      .toBe('Hello Ali, thank you for 50000 IQD');
  });

  it('supports nested keys', () => {
    expect(renderTemplate('Campaign: {{campaign.name}}', { campaign: { name: 'Orphans' } }))
      .toBe('Campaign: Orphans');
  });

  it('renders unknown variables as empty strings', () => {
    expect(renderTemplate('Hi {{missing}}!', {})).toBe('Hi !');
  });

  it('tolerates whitespace inside braces', () => {
    expect(renderTemplate('{{ name }}', { name: 'Ali' })).toBe('Ali');
  });

  it('does not execute anything', () => {
    expect(renderTemplate('{{constructor}}', {})).toBe('');
  });
});
