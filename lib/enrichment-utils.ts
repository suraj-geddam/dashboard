/**
 * Enrichment utility functions for store metadata classification
 */

export interface StoreMetadata {
  store_name: string;
  cuisine_type: string | null;
  store_category: string;
  price_range: string;
  _fallback?: boolean;
}

/**
 * Build enrichment prompt for batch store classification
 * @param storeNames - Array of store names to classify
 * @returns Formatted prompt for LLM
 */
export function buildEnrichmentPrompt(storeNames: string[]): string {
  return `/no_think You are a store classification expert. Given a list of store names, classify each with:
1. cuisine_type: The primary cuisine (e.g., "Thai", "Italian", "Chinese", "Indian", "Mexican", "American", "Japanese", "Other"). Use null for non-restaurants.
2. store_category: One of: "Restaurant", "Grocery", "Pharmacy", "Convenience Store", "Coffee Shop", "Fast Food", "Other"
3. price_range: Estimate based on name: "$" (budget), "$$" (moderate), "$$$" (upscale), "$$$$" (fine dining)

CRITICAL: Return ONLY valid JSON. No explanation, no markdown.

Store names:
${storeNames.map((name, idx) => `${idx + 1}. ${name}`).join('\n')}

Response format (array of objects):
[
  {
    "store_name": "Mitr Thai",
    "cuisine_type": "Thai",
    "store_category": "Restaurant",
    "price_range": "$$"
  },
  {
    "store_name": "CVS",
    "cuisine_type": null,
    "store_category": "Pharmacy",
    "price_range": "$"
  }
]

Return the JSON array now:`;
}

/**
 * Parse LLM enrichment response with fallback handling
 * @param responseText - Raw LLM response text
 * @param storeNames - Original store names for fallback
 * @returns Parsed and validated enrichment results
 */
export function parseEnrichmentResponse(responseText: string, storeNames: string[]): StoreMetadata[] {
  try {
    // Strip markdown artifacts
    let cleaned = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

    // Parse JSON
    const parsed = JSON.parse(cleaned);

    // Validate structure
    if (!Array.isArray(parsed)) {
      throw new Error('Response is not an array');
    }

    // Filter valid entries (must have required fields)
    return parsed.filter((item: any) =>
      item.store_name &&
      item.store_category &&
      item.price_range
    );
  } catch (error) {
    console.error('Failed to parse enrichment response:', error);

    // Fallback: Create default entries
    return storeNames.map(name => ({
      store_name: name,
      cuisine_type: null,
      store_category: 'Other',
      price_range: '$$',
      _fallback: true
    }));
  }
}
