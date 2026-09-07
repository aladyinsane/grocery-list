/**
 * Working out which aisle an item belongs in (ADR-0008).
 *
 * This runs on the client at the moment an item is added, so it has to be instant, work
 * with no signal, and cost nothing. That rules out asking anything over the network and
 * leaves a lookup in memory.
 *
 * It lives in the shared package rather than the web app because ADR-0002 commits us to
 * Siri posting text to `/api/quick-add`, and an item added by voice has no client to
 * categorize it — the Worker will need exactly these rules. One implementation cannot
 * disagree with itself about where bread goes.
 */

import { UNCATEGORIZED, type Category } from './categories.js';

/**
 * Common grocery items by aisle.
 *
 * Not exhaustive and not trying to be: two people buy roughly the same things forever, and
 * anything missed lands in "Other", is corrected in one tap, and is then remembered by the
 * household's own history. If something keeps landing in "Other", add it here.
 *
 * British names appear alongside American ones as extra keys. Nothing user-facing reads as
 * British — the aisle names are what get shown — but typing it should still work.
 *
 * check-docs: allow-british:start — the entries below are lookup keys, not prose. They
 * exist so that either spelling of an item finds the right aisle.
 */
const DICTIONARY: Record<Category, readonly string[]> = {
  Produce: [
    'apple', 'apples', 'avocado', 'avocados', 'banana', 'bananas', 'basil', 'bell pepper',
    'berries', 'blueberries', 'broccoli', 'cabbage', 'carrot', 'carrots', 'cauliflower',
    'celery', 'cilantro', 'coriander', 'corn', 'cucumber', 'garlic', 'ginger', 'grapes',
    'green beans', 'greens', 'kale', 'lemon', 'lemons', 'lettuce', 'lime', 'limes',
    'mango', 'melon', 'mushroom', 'mushrooms', 'onion', 'onions', 'orange', 'oranges',
    'parsley', 'peach', 'peaches', 'pear', 'pears', 'peppers', 'pineapple', 'potato',
    'potatoes', 'raspberries', 'romaine', 'salad', 'scallion', 'scallions', 'spinach',
    'spring onion', 'spring onions', 'squash', 'strawberries', 'sweet potato',
    'sweet potatoes', 'tomato', 'tomatoes', 'zucchini', 'courgette', 'eggplant',
    'aubergine', 'arugula', 'rocket', 'herbs', 'fruit', 'vegetables', 'veg',
  ],
  Bakery: [
    'bagel', 'bagels', 'baguette', 'bread', 'buns', 'cake', 'croissant', 'croissants',
    'donuts', 'english muffins', 'muffins', 'naan', 'pita', 'rolls', 'sourdough',
    'tortillas', 'wraps',
  ],
  'Dairy & Eggs': [
    'almond milk', 'butter', 'cheddar', 'cheese', 'cottage cheese', 'cream',
    'cream cheese', 'creamer', 'eggs', 'feta', 'greek yogurt', 'half and half',
    'heavy cream', 'milk', 'mozzarella', 'oat milk', 'parmesan', 'sour cream',
    'soy milk', 'whipped cream', 'yogurt',
  ],
  'Meat & Fish': [
    'bacon', 'beef', 'chicken', 'chicken breast', 'chicken thighs', 'cod', 'deli meat',
    'ground beef', 'ground turkey', 'ham', 'lamb', 'mince', 'pork', 'prosciutto',
    'salmon', 'sausage', 'sausages', 'shrimp', 'prawns', 'steak', 'tilapia', 'tuna',
    'turkey',
  ],
  Frozen: [
    'frozen berries', 'frozen fruit', 'frozen peas', 'frozen pizza', 'frozen vegetables',
    'ice', 'ice cream', 'popsicles', 'waffles',
  ],
  Pantry: [
    'baking powder', 'baking soda', 'beans', 'black beans', 'bread crumbs', 'broth',
    'brown sugar', 'cereal', 'chickpeas', 'chips', 'chocolate', 'cinnamon', 'cocoa',
    'coconut milk', 'crackers', 'cumin', 'flour', 'granola', 'honey', 'hot sauce',
    'jam', 'ketchup', 'lentils', 'maple syrup', 'mayo', 'mayonnaise', 'mustard',
    'noodles', 'nutella', 'nuts', 'oats', 'oatmeal', 'oil', 'olive oil', 'olives',
    'pasta', 'peanut butter', 'pepper', 'pesto', 'pickles', 'popcorn', 'quinoa',
    'raisins', 'rice', 'salsa', 'salt', 'soup', 'soy sauce', 'spaghetti', 'sugar',
    'syrup', 'tahini', 'tomato paste', 'tomato sauce', 'tortilla chips', 'tuna cans',
    'vanilla', 'vinegar', 'yeast', 'almonds', 'cashews', 'walnuts', 'snacks',
    'biscuits', 'cookies', 'pretzels', 'seasoning', 'spices',
  ],
  Drinks: [
    'beer', 'coffee', 'coke', 'espresso', 'juice', 'kombucha', 'lemonade',
    'orange juice', 'seltzer', 'soda', 'sparkling water', 'tea', 'water', 'wine',
  ],
  Household: [
    'aluminum foil', 'batteries', 'bin bags', 'bleach', 'body wash', 'candles',
    'cling film', 'conditioner', 'deodorant', 'detergent', 'dish soap', 'dishwasher tabs',
    'floss', 'foil', 'garbage bags', 'hand soap', 'laundry detergent', 'lightbulbs',
    'lotion', 'napkins', 'paper towels', 'parchment paper', 'plastic wrap', 'razors',
    'shampoo', 'soap', 'sponges', 'sunscreen', 'tissues', 'toilet paper', 'toothpaste',
    'trash bags', 'wipes', 'ziploc bags',
  ],
  Other: [],
};
// check-docs: allow-british:end

/** Longest keys first, so "oat milk" wins over "milk". */
const BY_NAME: ReadonlyMap<string, Category> = new Map(
  Object.entries(DICTIONARY).flatMap(([category, names]) =>
    names.map((name) => [name, category as Category] as const),
  ),
);

/**
 * Reduce a typed item to something matchable.
 *
 * "2% Milk", "milk," and "  MILK " all have to reach the same place, so punctuation and
 * case go, and whitespace collapses.
 */
export function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Which aisle an item belongs in.
 *
 * `known` is the household's own history — normalized name to the category it ended up in
 * — and it wins over the dictionary. That is what makes a correction stick: move "oat milk"
 * to Dairy & Eggs once, and next week's "oat milk" goes there without being asked.
 */
export function categorize(name: string, known?: ReadonlyMap<string, Category>): Category {
  const normalized = normalize(name);
  if (!normalized) return UNCATEGORIZED;

  const remembered = known?.get(normalized);
  if (remembered) return remembered;

  const exact = BY_NAME.get(normalized);
  if (exact) return exact;

  // Fall back to the longest run of words that the dictionary recognizes, so
  // "organic whole milk" finds "milk" and "frozen peas" beats a bare "peas".
  const words = normalized.split(' ');
  for (let length = words.length; length > 0; length -= 1) {
    for (let start = 0; start + length <= words.length; start += 1) {
      const phrase = words.slice(start, start + length).join(' ');
      const match = known?.get(phrase) ?? BY_NAME.get(phrase);
      if (match) return match;
    }
  }

  return UNCATEGORIZED;
}

/**
 * Build the household's memory from the items it already has.
 *
 * Tombstones count: an item cleared last week is exactly the evidence we want. This is
 * best-effort by design — a client rebuilt by a full resync has forgotten, and falls back
 * to the dictionary (ADR-0008).
 */
export function rememberedCategories(
  items: readonly { name: string; category: Category | null }[],
): Map<string, Category> {
  const known = new Map<string, Category>();
  for (const item of items) {
    if (item.category && item.category !== UNCATEGORIZED) {
      known.set(normalize(item.name), item.category);
    }
  }
  return known;
}
