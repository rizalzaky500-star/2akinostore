export function filterProducts(products, query) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return products;

  return products.filter((product) =>
    [product.title, product.category, product.duration]
      .filter(Boolean)
      .some((value) => value.toLocaleLowerCase().includes(normalizedQuery)),
  );
}

export function normalizeStockInput(value) {
  const normalizedValue = value.trim();
  if (!normalizedValue) return null;

  const stock = Number(normalizedValue);
  if (!Number.isSafeInteger(stock) || stock < 0) {
    throw new Error('Stok harus berupa bilangan bulat nol atau lebih. Kosongkan untuk stok tak terbatas.');
  }
  return stock;
}

export function groupProductsByCategory(categories, products, query = '') {
  const filtered = filterProducts(products, query);
  const byCategory = new Map();
  for (const product of filtered) {
    const key = product.category.toLocaleLowerCase();
    const group = byCategory.get(key);
    if (group) group.push(product);
    else byCategory.set(key, [product]);
  }
  return {
    total: filtered.length,
    groups: categories.map((category) => ({
      category,
      products: byCategory.get(category.name.toLocaleLowerCase()) ?? [],
    })),
  };
}

export function removeEmptyCategory(categories, products, categoryName) {
  if (products.some((product) => product.category.toLocaleLowerCase() === categoryName.toLocaleLowerCase())) {
    throw new Error('Kategori masih memiliki produk. Hapus atau pindahkan produk sebelum menghapus kategori.');
  }
  return categories.filter((category) => category.name.toLocaleLowerCase() !== categoryName.toLocaleLowerCase());
}

export function decrementProductStock(products, productId) {
  const product = products.find((item) => item.id === productId);
  if (!product) return products;
  if (product.stock == null) return products;
  if (!Number.isSafeInteger(product.stock) || product.stock < 1) {
    throw new Error('Stok produk habis. Tambahkan stok sebelum memverifikasi pembayaran.');
  }
  return products.map((item) => (
    item.id === productId ? { ...item, stock: item.stock - 1 } : item
  ));
}
