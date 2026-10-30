/**
 * Helpers for shopping cart operations, calculations, and stock validation.
 */

export function addToCart(cart, product, quantity = 1) {
  if (!product || !product.id) {
    throw new Error('Produk tidak valid.');
  }
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new Error('Jumlah produk harus berupa bilangan bulat positif.');
  }
  if (product.stock === 0) {
    throw new Error(`Stok produk "${product.title}" sudah habis.`);
  }

  const existingIndex = cart.findIndex((item) => item.productId === product.id);
  const currentQuantity = existingIndex >= 0 ? cart[existingIndex].quantity : 0;
  const targetQuantity = currentQuantity + quantity;

  if (product.stock != null && targetQuantity > product.stock) {
    throw new Error(`Jumlah melebihi stok yang tersedia (${product.stock}).`);
  }

  if (existingIndex >= 0) {
    return cart.map((item, index) =>
      index === existingIndex
        ? {
            ...item,
            quantity: targetQuantity,
            price: product.price,
            stock: product.stock,
            title: product.title,
            duration: product.duration,
            icon: product.icon,
            category: product.category,
          }
        : item,
    );
  }

  return [
    ...cart,
    {
      productId: product.id,
      title: product.title,
      price: product.price,
      duration: product.duration,
      icon: product.icon,
      category: product.category,
      stock: product.stock,
      quantity,
    },
  ];
}

export function updateCartQuantity(cart, productId, newQuantity, availableStock) {
  if (!Number.isSafeInteger(newQuantity)) {
    throw new Error('Jumlah produk tidak valid.');
  }
  if (newQuantity <= 0) {
    return cart.filter((item) => item.productId !== productId);
  }
  if (availableStock != null && newQuantity > availableStock) {
    throw new Error(`Jumlah melebihi stok yang tersedia (${availableStock}).`);
  }

  return cart.map((item) =>
    item.productId === productId
      ? { ...item, quantity: newQuantity }
      : item,
  );
}

export function removeFromCart(cart, productId) {
  return cart.filter((item) => item.productId !== productId);
}

export function clearCart() {
  return [];
}

export function calculateCartTotals(cart, catalogProducts = []) {
  const productMap = new Map((catalogProducts || []).map((product) => [product.id, product]));

  let totalItems = 0;
  let totalAmount = 0;

  const items = cart.map((item) => {
    const catalogProduct = productMap.get(item.productId);
    const unitPrice = catalogProduct?.price ?? item.price;
    const availableStock = catalogProduct ? catalogProduct.stock : item.stock;
    const subtotal = unitPrice * item.quantity;

    totalItems += item.quantity;
    totalAmount += subtotal;

    return {
      ...item,
      price: unitPrice,
      availableStock,
      subtotal,
      isOutOfStock: availableStock === 0,
      hasExceededStock: availableStock != null && item.quantity > availableStock,
    };
  });

  return {
    totalItems,
    totalAmount,
    items,
  };
}

export function validateCartStock(cart, catalogProducts = []) {
  if (!cart || cart.length === 0) {
    return { isValid: false, error: 'Keranjang belanja masih kosong.' };
  }

  const productMap = new Map((catalogProducts || []).map((product) => [product.id, product]));

  for (const item of cart) {
    const product = productMap.get(item.productId);
    if (!product) {
      // If catalog isn't loaded yet or product was deleted
      if (catalogProducts && catalogProducts.length > 0) {
        return { isValid: false, error: `Produk "${item.title}" sudah tidak tersedia di katalog.` };
      }
      continue;
    }

    if (product.stock === 0) {
      return { isValid: false, error: `Stok produk "${product.title}" sudah habis.` };
    }

    if (product.stock != null && item.quantity > product.stock) {
      return {
        isValid: false,
        error: `Jumlah pesanan "${product.title}" (${item.quantity}) melebihi stok yang tersedia (${product.stock}).`,
      };
    }
  }

  return { isValid: true };
}

export function syncCartWithCatalog(cart, catalogProducts = []) {
  if (!cart || cart.length === 0 || !catalogProducts || catalogProducts.length === 0) {
    return cart || [];
  }

  const productMap = new Map(catalogProducts.map((product) => [product.id, product]));

  return cart
    .map((item) => {
      const product = productMap.get(item.productId);
      if (!product || product.stock === 0) {
        return null;
      }

      let quantity = item.quantity;
      if (product.stock != null && quantity > product.stock) {
        quantity = product.stock;
      }

      return {
        ...item,
        title: product.title,
        price: product.price,
        duration: product.duration,
        icon: product.icon,
        category: product.category,
        stock: product.stock,
        quantity,
      };
    })
    .filter(Boolean);
}
