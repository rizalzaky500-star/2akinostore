import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addToCart,
  clearCart,
  calculateCartTotals,
  removeFromCart,
  syncCartWithCatalog,
  updateCartQuantity,
  validateCartStock,
} from './cart.js';

const mockProductA = {
  id: 'prod-a',
  title: 'Netflix 1 Bulan',
  price: 35000,
  duration: '30 Hari',
  icon: 'tv',
  category: 'Netflix',
  stock: 5,
};

const mockProductB = {
  id: 'prod-b',
  title: 'Spotify Premium',
  price: 25000,
  duration: '1 Bulan',
  icon: 'spotify',
  category: 'Spotify',
  stock: null, // unlimited
};

const mockProductC = {
  id: 'prod-c',
  title: 'Canva Pro',
  price: 10000,
  duration: '1 Tahun',
  icon: 'canva',
  category: 'Canva',
  stock: 0, // sold out
};

test('addToCart adds a product with initial quantity', () => {
  const cart = addToCart([], mockProductA, 1);
  assert.equal(cart.length, 1);
  assert.equal(cart[0].productId, 'prod-a');
  assert.equal(cart[0].quantity, 1);
  assert.equal(cart[0].price, 35000);
});

test('addToCart increments quantity when adding the same product', () => {
  let cart = addToCart([], mockProductA, 1);
  cart = addToCart(cart, mockProductA, 2);
  assert.equal(cart.length, 1);
  assert.equal(cart[0].quantity, 3);
});

test('addToCart prevents adding sold out products', () => {
  assert.throws(() => addToCart([], mockProductC, 1), /sudah habis/);
});

test('addToCart prevents exceeding available stock', () => {
  assert.throws(() => addToCart([], mockProductA, 6), /melebihi stok/);

  let cart = addToCart([], mockProductA, 4);
  assert.throws(() => addToCart(cart, mockProductA, 2), /melebihi stok/);
});

test('addToCart allows unlimited adding for products with null stock', () => {
  let cart = addToCart([], mockProductB, 10);
  cart = addToCart(cart, mockProductB, 50);
  assert.equal(cart[0].quantity, 60);
});

test('updateCartQuantity changes quantity, clamps to stock, and removes when zero', () => {
  let cart = addToCart([], mockProductA, 2);
  cart = updateCartQuantity(cart, 'prod-a', 4, 5);
  assert.equal(cart[0].quantity, 4);

  // exceeds stock
  assert.throws(() => updateCartQuantity(cart, 'prod-a', 6, 5), /melebihi stok/);

  // set to zero removes item
  cart = updateCartQuantity(cart, 'prod-a', 0, 5);
  assert.equal(cart.length, 0);
});

test('removeFromCart and clearCart work as expected', () => {
  let cart = addToCart([], mockProductA, 1);
  cart = addToCart(cart, mockProductB, 2);
  assert.equal(cart.length, 2);

  cart = removeFromCart(cart, 'prod-a');
  assert.equal(cart.length, 1);
  assert.equal(cart[0].productId, 'prod-b');

  cart = clearCart();
  assert.deepEqual(cart, []);
});

test('calculateCartTotals calculates item subtotals and overall totals', () => {
  let cart = addToCart([], mockProductA, 2); // 35000 * 2 = 70000
  cart = addToCart(cart, mockProductB, 3); // 25000 * 3 = 75000

  const totals = calculateCartTotals(cart, [mockProductA, mockProductB]);
  assert.equal(totals.totalCount, 2);
  assert.equal(totals.totalItems, 5);
  assert.equal(totals.totalAmount, 145000);
  assert.equal(totals.items[0].subtotal, 70000);
  assert.equal(totals.items[1].subtotal, 75000);
});

test('validateCartStock verifies stock availability before checkout', () => {
  const emptyResult = validateCartStock([]);
  assert.equal(emptyResult.isValid, false);

  const cartValid = [{ productId: 'prod-a', title: 'Netflix', quantity: 2 }];
  assert.equal(validateCartStock(cartValid, [mockProductA]).isValid, true);

  const cartExceeded = [{ productId: 'prod-a', title: 'Netflix', quantity: 10 }];
  const exceededResult = validateCartStock(cartExceeded, [mockProductA]);
  assert.equal(exceededResult.isValid, false);
  assert.match(exceededResult.error, /melebihi stok/);

  const cartSoldOut = [{ productId: 'prod-c', title: 'Canva', quantity: 1 }];
  const soldOutResult = validateCartStock(cartSoldOut, [mockProductC]);
  assert.equal(soldOutResult.isValid, false);
  assert.match(soldOutResult.error, /sudah habis/);
});

test('syncCartWithCatalog removes out-of-stock items and clamps quantities', () => {
  const cart = [
    { productId: 'prod-a', title: 'Netflix', quantity: 8, price: 30000 },
    { productId: 'prod-c', title: 'Canva', quantity: 1, price: 10000 },
  ];

  const synced = syncCartWithCatalog(cart, [mockProductA, mockProductC]);
  assert.equal(synced.length, 1);
  assert.equal(synced[0].productId, 'prod-a');
  assert.equal(synced[0].quantity, 5); // clamped to mockProductA.stock (5)
  assert.equal(synced[0].price, 35000); // synced to updated price
});
