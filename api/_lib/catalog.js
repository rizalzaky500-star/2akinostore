import { randomUUID } from 'node:crypto';
import { getDb } from './db.js';

const PRODUCT_COLLECTION = 'products';
const CATEGORY_COLLECTION = 'categories';

export class CatalogError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

function cleanDocument(document) {
  if (!document) return null;
  const { _id, ...value } = document;
  return value;
}

function normalizeCategoryName(name) {
  return name.trim().toLocaleLowerCase();
}

function validateCategory(input) {
  if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 80) {
    throw new CatalogError('Nama kategori wajib diisi dan maksimal 80 karakter.');
  }
  if (typeof input.icon !== 'string' || input.icon.length > 80) {
    throw new CatalogError('Ikon kategori tidak valid.');
  }
  if (input.guide != null && (typeof input.guide !== 'string' || input.guide.length > 4000)) {
    throw new CatalogError('Panduan kategori maksimal 4000 karakter.');
  }

  return {
    name: input.name.trim(),
    icon: input.icon,
    color: typeof input.color === 'string' ? input.color : 'text-amber-300',
    ...(typeof input.guide === 'string' && input.guide.trim() ? { guide: input.guide.trim() } : {}),
  };
}

function validateProduct(input, { requireId = false } = {}) {
  if (requireId && (typeof input?.id !== 'string' || !input.id.trim() || input.id.length > 100)) {
    throw new CatalogError('ID produk tidak valid.');
  }
  if (typeof input?.title !== 'string' || !input.title.trim() || input.title.trim().length > 160) {
    throw new CatalogError('Nama produk wajib diisi dan maksimal 160 karakter.');
  }
  if (typeof input.category !== 'string' || !input.category.trim() || input.category.trim().length > 80) {
    throw new CatalogError('Kategori produk wajib diisi.');
  }
  if (!Number.isSafeInteger(input.price) || input.price <= 0) {
    throw new CatalogError('Harga produk harus berupa bilangan bulat positif.');
  }
  if (typeof input.duration !== 'string' || !input.duration.trim() || input.duration.trim().length > 160) {
    throw new CatalogError('Durasi atau garansi produk wajib diisi dan maksimal 160 karakter.');
  }
  if (input.stock != null && (!Number.isSafeInteger(input.stock) || input.stock < 0)) {
    throw new CatalogError('Stok harus berupa bilangan bulat nol atau lebih, atau null untuk stok tak terbatas.');
  }
  if (input.guide != null && (typeof input.guide !== 'string' || input.guide.length > 4000)) {
    throw new CatalogError('Panduan produk maksimal 4000 karakter.');
  }
  if (typeof input.icon !== 'string' || input.icon.length > 80) {
    throw new CatalogError('Ikon produk tidak valid.');
  }

  return {
    ...(requireId ? { id: input.id.trim() } : {}),
    title: input.title.trim(),
    category: input.category.trim(),
    price: input.price,
    duration: input.duration.trim(),
    stock: input.stock ?? null,
    icon: input.icon,
    ...(typeof input.guide === 'string' && input.guide.trim() ? { guide: input.guide.trim() } : {}),
  };
}

export async function readCatalog() {
  const db = await getDb();
  const [categories, products] = await Promise.all([
    db.collection(CATEGORY_COLLECTION).find({}).sort({ name: 1 }).toArray(),
    db.collection(PRODUCT_COLLECTION).find({}).sort({ category: 1, title: 1 }).toArray(),
  ]);
  return {
    categories: categories.map(cleanDocument),
    products: products.map(cleanDocument),
  };
}

export async function createCategory(input) {
  const category = validateCategory(input);
  const db = await getDb();
  const collection = db.collection(CATEGORY_COLLECTION);
  const id = normalizeCategoryName(category.name);
  const existing = await collection.findOne({ _id: id });
  if (existing) throw new CatalogError('Kategori tersebut sudah ada.', 409);

  await collection.insertOne({ _id: id, ...category });
  return category;
}

export async function updateCategory(name, patch) {
  if (typeof name !== 'string' || !name.trim()) throw new CatalogError('Nama kategori tidak valid.');
  if (!patch || typeof patch !== 'object') throw new CatalogError('Perubahan kategori tidak valid.');
  const db = await getDb();
  const collection = db.collection(CATEGORY_COLLECTION);
  const allowed = {};
  if (Object.hasOwn(patch, 'guide')) {
    if (patch.guide != null && (typeof patch.guide !== 'string' || patch.guide.length > 4000)) {
      throw new CatalogError('Panduan kategori maksimal 4000 karakter.');
    }
    if (patch.guide?.trim()) allowed.guide = patch.guide.trim();
    else allowed.guide = '';
  }
  if (Object.keys(allowed).length === 0) throw new CatalogError('Tidak ada perubahan kategori yang valid.');

  const update = { $set: allowed };
  if (allowed.guide === '') {
    delete allowed.guide;
    update.$unset = { guide: '' };
  }
  const updated = await collection.findOneAndUpdate(
    { _id: normalizeCategoryName(name) },
    update,
    { returnDocument: 'after' },
  );
  if (!updated) return null;
  return cleanDocument(updated);
}

export async function deleteCategory(name) {
  if (typeof name !== 'string' || !name.trim()) throw new CatalogError('Nama kategori tidak valid.');
  const db = await getDb();
  const categories = db.collection(CATEGORY_COLLECTION);
  const category = await categories.findOne({ _id: normalizeCategoryName(name) });
  if (!category) return { deleted: false, missing: true };

  const linkedProduct = await db.collection(PRODUCT_COLLECTION).findOne({ category: category.name });
  if (linkedProduct) throw new CatalogError('Kategori masih memiliki produk. Hapus atau pindahkan produk terlebih dahulu.', 409);

  await categories.deleteOne({ _id: category._id });
  return { deleted: true };
}

export async function createProduct(input) {
  const product = validateProduct(input);
  const db = await getDb();
  const category = await db.collection(CATEGORY_COLLECTION).findOne({
    _id: normalizeCategoryName(product.category),
  });
  if (!category) throw new CatalogError('Kategori produk tidak ditemukan.', 404);

  product.category = category.name;
  product.id = randomUUID();
  await db.collection(PRODUCT_COLLECTION).insertOne({ _id: product.id, ...product });
  return product;
}

export async function updateProduct(id, patch) {
  if (typeof id !== 'string' || !id || id.length > 100) throw new CatalogError('ID produk tidak valid.');
  if (!patch || typeof patch !== 'object') throw new CatalogError('Perubahan produk tidak valid.');
  const allowed = {};
  for (const field of ['title', 'category', 'price', 'duration', 'stock', 'icon', 'guide']) {
    if (Object.hasOwn(patch, field)) allowed[field] = patch[field];
  }
  if (Object.keys(allowed).length === 0) throw new CatalogError('Tidak ada perubahan produk yang valid.');

  const db = await getDb();
  const collection = db.collection(PRODUCT_COLLECTION);
  const existing = await collection.findOne({ _id: id });
  if (!existing) return null;
  const candidate = validateProduct({ ...cleanDocument(existing), ...allowed, id }, { requireId: true });
  const category = await db.collection(CATEGORY_COLLECTION).findOne({
    _id: normalizeCategoryName(candidate.category),
  });
  if (!category) throw new CatalogError('Kategori produk tidak ditemukan.', 404);
  candidate.category = category.name;
  const { id: productId, ...fields } = candidate;
  const update = { $set: fields };
  if (Object.hasOwn(patch, 'guide') && !candidate.guide) update.$unset = { guide: '' };
  const updated = await collection.findOneAndUpdate(
    { _id: productId },
    update,
    { returnDocument: 'after' },
  );
  if (!updated) return null;
  return cleanDocument(updated);
}

export async function deleteProduct(id) {
  if (typeof id !== 'string' || !id || id.length > 100) throw new CatalogError('ID produk tidak valid.');
  const db = await getDb();
  const result = await db.collection(PRODUCT_COLLECTION).deleteOne({ _id: id });
  return result.deletedCount > 0;
}

export async function decrementStock(id, count = 1) {
  if (typeof id !== 'string' || !id || id.length > 100) throw new CatalogError('ID produk tidak valid.');
  const decrementCount = Number(count);
  if (!Number.isSafeInteger(decrementCount) || decrementCount < 1) {
    throw new CatalogError('Jumlah pengurangan stok tidak valid.');
  }
  const db = await getDb();
  const collection = db.collection(PRODUCT_COLLECTION);
  const finite = await collection.findOneAndUpdate(
    { _id: id, stock: { $gte: decrementCount } },
    { $inc: { stock: -decrementCount } },
    { returnDocument: 'after' },
  );
  if (finite) return cleanDocument(finite);

  const unlimited = await collection.findOne({
    _id: id,
    $or: [{ stock: null }, { stock: { $exists: false } }],
  });
  if (unlimited) return cleanDocument(unlimited);

  const exists = await collection.findOne({ _id: id }, { projection: { _id: 1, stock: 1 } });
  if (!exists) return null;
  throw new CatalogError('Stok produk habis. Tambahkan stok sebelum memverifikasi pembayaran.', 409);
}

export async function migrateLegacyCatalog(input) {
  if (!Array.isArray(input?.categories) || !Array.isArray(input?.products)) {
    throw new CatalogError('Data katalog lama tidak valid.');
  }
  if (input.categories.length > 200 || input.products.length > 5000) {
    throw new CatalogError('Katalog lama melebihi batas 200 kategori atau 5000 produk.');
  }

  const categories = input.categories.map(validateCategory);
  const categoryNames = new Set(categories.map((category) => normalizeCategoryName(category.name)));
  if (categoryNames.size !== categories.length) {
    throw new CatalogError('Data katalog lama memiliki kategori duplikat.');
  }
  const categoryByName = new Map(categories.map((category) => [normalizeCategoryName(category.name), category]));
  const products = input.products.map((product) => {
    const category = typeof product.category === 'string'
      ? categoryByName.get(normalizeCategoryName(product.category))
      : null;
    return validateProduct(
      { ...product, category: category?.name || product.category, icon: product.icon || category?.icon },
      { requireId: true },
    );
  });
  const productIds = new Set(products.map((product) => product.id));
  if (productIds.size !== products.length) {
    throw new CatalogError('Data katalog lama memiliki ID produk duplikat.');
  }
  if (products.some((product) => !categoryNames.has(normalizeCategoryName(product.category)))) {
    throw new CatalogError('Setiap produk katalog lama harus memiliki kategori yang sesuai.');
  }

  const db = await getDb();
  const categoryCollection = db.collection(CATEGORY_COLLECTION);
  const productCollection = db.collection(PRODUCT_COLLECTION);
  const [existingCategoryIds, existingProductIds] = await Promise.all([
    categoryCollection.find({}, { projection: { _id: 1 } }).toArray(),
    productCollection.find({}, { projection: { _id: 1 } }).toArray(),
  ]);
  if (
    existingCategoryIds.some(({ _id }) => !categoryNames.has(_id)) ||
    existingProductIds.some(({ _id }) => !productIds.has(_id))
  ) {
    throw new CatalogError('Katalog MongoDB sudah berisi data lain; impor legacy hanya tersedia untuk katalog kosong atau impor yang dilanjutkan.', 409);
  }
  const categoryOps = categories.map((category) => ({
    updateOne: {
      filter: { _id: normalizeCategoryName(category.name) },
      update: { $setOnInsert: { _id: normalizeCategoryName(category.name), ...category } },
      upsert: true,
    },
  }));
  const productOps = products.map((product) => ({
    updateOne: {
      filter: { _id: product.id },
      update: { $setOnInsert: { _id: product.id, ...product } },
      upsert: true,
    },
  }));

  const [categoryResult, productResult] = await Promise.all([
    categoryOps.length ? categoryCollection.bulkWrite(categoryOps, { ordered: true }) : null,
    productOps.length ? productCollection.bulkWrite(productOps, { ordered: true }) : null,
  ]);

  return {
    importedCategories: categoryResult?.upsertedCount ?? 0,
    existingCategories: categories.length - (categoryResult?.upsertedCount ?? 0),
    importedProducts: productResult?.upsertedCount ?? 0,
    existingProducts: products.length - (productResult?.upsertedCount ?? 0),
  };
}
