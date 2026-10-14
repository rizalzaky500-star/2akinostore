async function request(path, { method = 'GET', body } = {}) {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    ...(body === undefined
      ? {}
      : {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error('Respons server tidak valid. Coba muat ulang halaman.');
  }

  if (!response.ok) {
    throw new Error(result?.error || 'Permintaan katalog gagal. Coba lagi.');
  }
  return result;
}

export async function fetchCatalog() {
  return request('/api/catalog');
}

export async function migrateLegacyCatalog(categories, products) {
  return request('/api/admin/catalog/migrate', {
    method: 'POST',
    body: { categories, products },
  });
}

export async function createCatalogProduct(product) {
  const result = await request('/api/admin/products', { method: 'POST', body: product });
  return result.product;
}

export async function updateCatalogProduct(id, patch) {
  const result = await request(`/api/admin/products/by-id?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: patch,
  });
  return result.product;
}

export async function removeCatalogProduct(id) {
  await request(`/api/admin/products/by-id?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function consumeCatalogProductStock(id) {
  const result = await request(`/api/admin/products/by-id?id=${encodeURIComponent(id)}`, { method: 'POST' });
  return result.product;
}

export async function createCatalogCategory(category) {
  const result = await request('/api/admin/categories', { method: 'POST', body: category });
  return result.category;
}

export async function updateCatalogCategory(name, patch) {
  const result = await request(`/api/admin/categories/by-name?name=${encodeURIComponent(name)}`, {
    method: 'PATCH',
    body: patch,
  });
  return result.category;
}

export async function removeCatalogCategory(name) {
  await request('/api/admin/categories', { method: 'DELETE', body: { name } });
}
