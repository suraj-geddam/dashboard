import { buildEnrichmentPrompt, parseEnrichmentResponse } from '../lib/enrichment-utils.ts';

describe('Enrichment Utils', () => {
  test('buildEnrichmentPrompt formats store names correctly', () => {
    const stores = ['Mitr Thai', 'CVS', 'Pizza Hut'];
    const prompt = buildEnrichmentPrompt(stores);

    expect(prompt).toContain('1. Mitr Thai');
    expect(prompt).toContain('2. CVS');
    expect(prompt).toContain('3. Pizza Hut');
    expect(prompt).toContain('cuisine_type');
    expect(prompt).toContain('store_category');
    expect(prompt).toContain('price_range');
  });

  test('parseEnrichmentResponse handles valid JSON', () => {
    const validResponse = JSON.stringify([
      { store_name: 'Mitr Thai', cuisine_type: 'Thai', store_category: 'Restaurant', price_range: '$$' },
      { store_name: 'CVS', cuisine_type: null, store_category: 'Pharmacy', price_range: '$' }
    ]);

    const result = parseEnrichmentResponse(validResponse, ['Mitr Thai', 'CVS']);

    expect(result).toHaveLength(2);
    expect(result[0].store_name).toBe('Mitr Thai');
    expect(result[0].cuisine_type).toBe('Thai');
    expect(result[1].cuisine_type).toBe(null);
  });

  test('parseEnrichmentResponse strips markdown artifacts', () => {
    const markdownResponse = '```json\n[{"store_name": "Test", "cuisine_type": "Thai", "store_category": "Restaurant", "price_range": "$$"}]\n```';

    const result = parseEnrichmentResponse(markdownResponse, ['Test']);

    expect(result).toHaveLength(1);
    expect(result[0].store_name).toBe('Test');
  });

  test('parseEnrichmentResponse uses fallback for invalid JSON', () => {
    const invalidResponse = 'not valid json at all';
    const storeNames = ['Store1', 'Store2'];

    const result = parseEnrichmentResponse(invalidResponse, storeNames);

    expect(result).toHaveLength(2);
    expect(result[0].store_category).toBe('Other');
    expect(result[0].price_range).toBe('$$');
    expect(result[0]._fallback).toBe(true);
  });

  test('parseEnrichmentResponse filters incomplete entries', () => {
    const partialResponse = JSON.stringify([
      { store_name: 'Complete', cuisine_type: 'Thai', store_category: 'Restaurant', price_range: '$$' },
      { store_name: 'Incomplete' } // Missing required fields
    ]);

    const result = parseEnrichmentResponse(partialResponse, ['Complete', 'Incomplete']);

    expect(result).toHaveLength(1); // Only complete entry
    expect(result[0].store_name).toBe('Complete');
  });
});
