import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeGuide,
  resolvePurchaseGuide,
  setCategoryGuide,
  setProductGuide,
} from './guides.js';

const categories = [
  { name: 'Netflix', guide: 'Login dulu, lalu kirim screenshot profil.' },
  { name: 'Canva', guide: '' },
];

test('a product guide overrides its category guide', () => {
  const product = { id: 'p1', category: 'Netflix', guide: 'Pakai undangan email.' };
  assert.equal(resolvePurchaseGuide(product, categories), 'Pakai undangan email.');
});

test('a product without a guide falls back to the category guide', () => {
  const product = { id: 'p2', category: 'Netflix' };
  assert.equal(resolvePurchaseGuide(product, categories), 'Login dulu, lalu kirim screenshot profil.');
});

test('an empty category guide yields no guide rather than placeholder text', () => {
  const product = { id: 'p3', category: 'Canva' };
  assert.equal(resolvePurchaseGuide(product, categories), '');
});

test('a product in an unknown category yields no guide', () => {
  assert.equal(resolvePurchaseGuide({ id: 'p4', category: 'Unknown' }, categories), '');
  assert.equal(resolvePurchaseGuide(null, categories), '');
});

test('category matching ignores letter case and surrounding whitespace', () => {
  const product = { id: 'p5', category: 'netflix' };
  assert.match(resolvePurchaseGuide(product, categories), /Login dulu/);
  assert.equal(resolvePurchaseGuide({ id: 'p6', category: ' Netflix ' }, categories), '');
});

test('blank or whitespace-only guides are treated as unset', () => {
  assert.equal(normalizeGuide('   '), '');
  assert.equal(normalizeGuide(undefined), '');
  assert.equal(normalizeGuide(42), '');
  assert.equal(resolvePurchaseGuide({ id: 'p7', category: 'Netflix', guide: '   ' }, categories), 
    'Login dulu, lalu kirim screenshot profil.');
});

test('editing one product guide does not touch other products or categories', () => {
  const products = [
    { id: 'a', category: 'Netflix', guide: 'lama' },
    { id: 'b', category: 'Canva' },
  ];
  const updated = setProductGuide(products, 'a', '  baru  ');
  assert.equal(updated[0].guide, 'baru');
  assert.equal(updated[1].guide, undefined);
  // original array is not mutated
  assert.equal(products[0].guide, 'lama');
});

test('editing a category guide leaves other categories and guides intact', () => {
  const updated = setCategoryGuide(categories, 'netflix', 'Baru');
  assert.equal(updated[0].guide, 'Baru');
  assert.equal(updated[1].guide, '');
  assert.equal(categories[0].guide, 'Login dulu, lalu kirim screenshot profil.');
});

test('guides saved for one category do not leak into another', () => {
  let cats = setCategoryGuide(categories, 'Canva', 'Unduh aplikasi Canva dulu.');
  const netflixProduct = { id: 'n', category: 'Netflix' };
  const canvaProduct = { id: 'c', category: 'Canva' };
  assert.match(resolvePurchaseGuide(netflixProduct, cats), /Login dulu/);
  assert.match(resolvePurchaseGuide(canvaProduct, cats), /Unduh aplikasi Canva/);
  cats = setCategoryGuide(cats, 'Netflix', 'Panduan Netflix baru.');
  assert.equal(resolvePurchaseGuide(netflixProduct, cats), 'Panduan Netflix baru.');
  assert.equal(resolvePurchaseGuide(canvaProduct, cats), 'Unduh aplikasi Canva dulu.');
});
