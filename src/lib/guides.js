/**
 * Purchase guides are optional free text stored directly on the category and
 * product records. A product guide describes one specific package; a category
 * guide describes the flow shared by every product in that category. The two
 * are distinct, so editing one never changes the other.
 */

export function normalizeGuide(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

/**
 * Resolves the guide to show for a product.
 *
 * A product-level guide wins over its category guide, because the product text
 * is the more specific instruction. When neither is set the result is empty so
 * callers hide the section instead of rendering placeholder text.
 */
export function resolvePurchaseGuide(product, categories = []) {
  if (!product) return '';
  const productGuide = normalizeGuide(product.guide);
  if (productGuide) return productGuide;

  const category = categories.find(
    (item) =>
      item.name.toLocaleLowerCase() === String(product.category ?? '').toLocaleLowerCase(),
  );
  return normalizeGuide(category?.guide);
}

/**
 * Updates the guide on a single product, leaving every other product and all
 * categories untouched.
 */
export function setProductGuide(products, productId, guide) {
  return products.map((product) =>
    product.id === productId ? { ...product, guide: normalizeGuide(guide) } : product,
  );
}

/**
 * Updates the guide on a single category, matched case-insensitively the same
 * way the rest of the app matches category names.
 */
export function setCategoryGuide(categories, categoryName, guide) {
  const target = String(categoryName ?? '').toLocaleLowerCase();
  return categories.map((category) =>
    category.name.toLocaleLowerCase() === target
      ? { ...category, guide: normalizeGuide(guide) }
      : category,
  );
}
