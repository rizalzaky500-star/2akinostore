import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decrementProductStock,
  filterProducts,
  groupProductsByCategory,
  normalizeStockInput,
  removeEmptyCategory,
} from './catalog.js';

const products = [
  { id: 'one', title: 'Premium Shared', category: 'Netflix', duration: '30 days', stock: 3 },
  { id: 'two', title: 'VIP', category: 'WeTV', duration: '90 days', stock: null },
];

test('product search matches name, category, and duration case-insensitively', () => {
  assert.deepEqual(filterProducts(products, 'shared'), [products[0]]);
  assert.deepEqual(filterProducts(products, 'wetv'), [products[1]]);
  assert.deepEqual(filterProducts(products, '90 DAYS'), [products[1]]);
  assert.deepEqual(filterProducts(products, 'missing'), []);
});

test('blank stock means unlimited and finite stock must be a non-negative integer', () => {
  assert.equal(normalizeStockInput(''), null);
  assert.equal(normalizeStockInput('  '), null);
  assert.equal(normalizeStockInput('0'), 0);
  assert.equal(normalizeStockInput('12'), 12);
  assert.throws(() => normalizeStockInput('-1'), /bilangan bulat/);
  assert.throws(() => normalizeStockInput('1.5'), /bilangan bulat/);
  assert.throws(() => normalizeStockInput('abc'), /bilangan bulat/);
});

test('groups products by category in a single pass, respecting the search query', () => {
  const categories = [{ name: 'Netflix' }, { name: 'WeTV' }, { name: 'Empty' }];

  const unfiltered = groupProductsByCategory(categories, products, '');
  assert.equal(unfiltered.total, 2);
  assert.deepEqual(
    unfiltered.groups.map(({ category, products: group }) => [category.name, group.length]),
    [['Netflix', 1], ['WeTV', 1], ['Empty', 0]],
  );

  const filtered = groupProductsByCategory(categories, products, 'wetv');
  assert.equal(filtered.total, 1);
  assert.deepEqual(
    filtered.groups.map(({ category, products: group }) => [category.name, group.map((item) => item.id)]),
    [['Netflix', []], ['WeTV', ['two']], ['Empty', []]],
  );
});

test('category deletion is blocked while products are assigned', () => {
  const categories = [{ name: 'Netflix' }, { name: 'WeTV' }, { name: 'Empty' }];
  assert.throws(
    () => removeEmptyCategory(categories, products, 'netflix'),
    /masih memiliki produk/,
  );
  assert.deepEqual(
    removeEmptyCategory(categories, products, 'missing'),
    categories,
  );
  assert.deepEqual(
    removeEmptyCategory(categories, products, 'Empty'),
    [{ name: 'Netflix' }, { name: 'WeTV' }],
  );
});

test('paid stock is decremented once while unlimited stock stays unlimited', () => {
  assert.deepEqual(decrementProductStock(products, 'one')[0].stock, 2);
  assert.equal(decrementProductStock(products, 'two')[1].stock, null);
  assert.throws(
    () => decrementProductStock([{ id: 'empty', stock: 0 }], 'empty'),
    /Stok produk habis/,
  );
});
