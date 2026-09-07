/**
 * Working out which aisle an item belongs in (ADR-0008).
 *
 * Named for the situation rather than the function, because what matters is whether a real
 * shopping list lands in sensible places.
 */

import { describe, expect, it } from 'vitest';
import { categorize, normalize, rememberedCategories } from '../src/categorize.js';
import { CATEGORIES, categoryOrder, isCategory, type Category } from '../src/categories.js';

describe('normalizing what someone typed', () => {
  it('ignores case, padding and punctuation', () => {
    expect(normalize('  MILK ')).toBe('milk');
    expect(normalize('2% Milk')).toBe('2 milk');
    expect(normalize('milk,')).toBe('milk');
  });

  it('survives an entirely unhelpful name', () => {
    expect(normalize('!!!')).toBe('');
    expect(categorize('!!!')).toBe('Other');
  });
});

describe('a typical week of shopping', () => {
  const expected: [string, Category][] = [
    ['milk', 'Dairy & Eggs'],
    ['eggs', 'Dairy & Eggs'],
    ['bread', 'Bakery'],
    ['bananas', 'Produce'],
    ['spinach', 'Produce'],
    ['chicken breast', 'Meat & Fish'],
    ['salmon', 'Meat & Fish'],
    ['frozen peas', 'Frozen'],
    ['ice cream', 'Frozen'],
    ['olive oil', 'Pantry'],
    ['pasta', 'Pantry'],
    ['coffee', 'Drinks'],
    ['sparkling water', 'Drinks'],
    ['toilet paper', 'Household'],
    ['dish soap', 'Household'],
  ];

  for (const [name, category] of expected) {
    it(`puts "${name}" in ${category}`, () => {
      expect(categorize(name)).toBe(category);
    });
  }
});

describe('names as people actually type them', () => {
  it('finds the item inside a longer description', () => {
    expect(categorize('organic whole milk')).toBe('Dairy & Eggs');
    expect(categorize('2% milk')).toBe('Dairy & Eggs');
    expect(categorize('a loaf of sourdough bread')).toBe('Bakery');
  });

  it('prefers the longer match when two could apply', () => {
    expect(categorize('frozen peas')).toBe('Frozen');
    expect(categorize('oat milk')).toBe('Dairy & Eggs');
  });

  it('accepts British names without them showing up anywhere', () => {
    // Typing "courgette" should work; the aisle shown is still the American one.
    expect(categorize('courgette')).toBe('Produce');
    expect(categorize('aubergine')).toBe('Produce');
    expect(categorize('prawns')).toBe('Meat & Fish');
  });

  it('gives up gracefully on something it has never heard of', () => {
    expect(categorize('nduja')).toBe('Other');
    expect(categorize('')).toBe('Other');
  });
});

describe('remembering a correction', () => {
  it('uses the household history over the dictionary', () => {
    // Someone moved "oat milk" to Pantry. Next week's goes there, even though the
    // dictionary would say Dairy & Eggs.
    const known = rememberedCategories([{ name: 'Oat Milk', category: 'Pantry' }]);
    expect(categorize('oat milk', known)).toBe('Pantry');
  });

  it('remembers something the dictionary has never heard of', () => {
    const known = rememberedCategories([{ name: 'nduja', category: 'Meat & Fish' }]);
    expect(categorize('nduja', known)).toBe('Meat & Fish');
  });

  it('matches a remembered name regardless of how it was capitalized', () => {
    const known = rememberedCategories([{ name: '  KOMBUCHA ', category: 'Drinks' }]);
    expect(categorize('kombucha', known)).toBe('Drinks');
  });

  it('does not remember items left in Other', () => {
    // "Other" is the absence of a decision, not a decision worth repeating.
    expect(rememberedCategories([{ name: 'nduja', category: 'Other' }]).size).toBe(0);
  });

  it('ignores items with no category at all', () => {
    expect(rememberedCategories([{ name: 'milk', category: null }]).size).toBe(0);
  });
});

describe('the aisles themselves', () => {
  it('walks the shop in a fixed order, ending in Other', () => {
    expect(CATEGORIES[0]).toBe('Produce');
    expect(CATEGORIES[CATEGORIES.length - 1]).toBe('Other');
  });

  it('sorts an uncategorized item to the end', () => {
    expect(categoryOrder(null)).toBeGreaterThan(categoryOrder('Household'));
  });

  it('recognizes only real categories', () => {
    expect(isCategory('Produce')).toBe(true);
    expect(isCategory('produce')).toBe(false);
    expect(isCategory(null)).toBe(false);
  });
});
