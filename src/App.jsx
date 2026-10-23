import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Check,
  CheckCircle2,
  Clapperboard,
  Clock3,
  Film,
  FolderPlus,
  Headphones,
  KeyRound,
  LockKeyhole,
  MonitorPlay,
  Music2,
  Package,
  Pencil,
  PenTool,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Trash2,
  Tv,
  WalletCards,
} from 'lucide-react';
import { Button } from './components/ui/button.jsx';
import RubberSegment from './components/RubberSegment.jsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './components/ui/dialog.jsx';
import {
  filterProducts,
  groupProductsByCategory,
  normalizeStockInput,
} from './lib/catalog.js';
import {
  isQrisOpen,
  STORE_CLOSED_MESSAGE,
} from './lib/operatingHours.js';
import {
  resolvePurchaseGuide,
} from './lib/guides.js';
import {
  createCatalogCategory,
  createCatalogProduct,
  fetchCatalog,
  migrateLegacyCatalog,
  removeCatalogCategory,
  removeCatalogProduct,
  updateCatalogCategory,
  updateCatalogProduct,
} from './lib/catalogApi.js';
import {
  changeAdminPassword,
  loginAdmin,
  logoutAdmin as logoutAdminRequest,
} from './lib/adminAuth.js';
import {
  createPayment,
  fetchAdminPayments,
  fetchPaymentStatus,
} from './lib/paymentApi.js';

const STORAGE_KEY_CATS = '2akinostore_cats_v12';
const STORAGE_KEY_PRODS = '2akinostore_products_v12';
const STORAGE_KEY_TRANS = '2akinostore_transactions_v12';
const STORAGE_KEY_SETTINGS = '2akinostore_settings_v12';

const defaultCategories = [
  { name: 'Netflix', icon: 'tv', color: 'text-red-400' },
  { name: 'CapCut', icon: 'video', color: 'text-cyan-300' },
  { name: 'Spotify', icon: 'spotify', color: 'text-emerald-400' },
  { name: 'WeTV', icon: 'wetv', color: 'text-emerald-300' },
  { name: 'Canva', icon: 'canva', color: 'text-blue-400' },
  { name: 'Disney+', icon: 'disney', color: 'text-indigo-300' },
  { name: 'iQIYI', icon: 'iqiyi', color: 'text-emerald-300' },
];

const defaultProducts = [
  { id: 'p1', category: 'Netflix', title: 'Netflix Shared 1 Profile', price: 35000, duration: '30 Hari Full Garansi', icon: 'tv' },
  { id: 'p2', category: 'Netflix', title: 'Netflix Private Full Account (4K)', price: 160000, duration: '30 Hari Full Garansi (5 Profile)', icon: 'film' },
  { id: 'p3', category: 'CapCut', title: 'CapCut Pro 1 Bulan', price: 15000, duration: '30 Hari Garansi', icon: 'video' },
  { id: 'p4', category: 'Spotify', title: 'Spotify Premium Individual', price: 25000, duration: '1 Bulan Garansi Anti Plan Fall', icon: 'spotify' },
  { id: 'p5', category: 'WeTV', title: 'WeTV VIP Premium', price: 15000, duration: '1 Bulan Invite Family', icon: 'wetv' },
  { id: 'p6', category: 'Canva', title: 'Canva Pro Designer', price: 10000, duration: '1 Tahun Garansi Tim', icon: 'canva' },
  { id: 'p7', category: 'iQIYI', title: 'iQIYI VIP Premium Standard', price: 20000, duration: '1 Bulan Garansi Full', icon: 'iqiyi' },
];

const defaultSettings = { adminWA: '6285111219046' };
const currency = new Intl.NumberFormat('id-ID');
const inputClass =
  'mt-2 h-11 w-full rounded-xl border border-white/15 bg-black/40 px-4 text-sm text-white outline-none transition placeholder:text-zinc-400 focus:border-red-500/70 focus:ring-2 focus:ring-red-500/15';

// The QR renderer is only needed once a customer reaches the payment step, so
// it is split out of the initial bundle instead of shipping on every visit.
const LazyQrCode = lazy(() =>
  import('qrcode.react').then((module) => ({ default: module.QRCodeSVG })),
);

/**
 * Reads a persisted JSON value. A corrupted or hand-edited entry must never
 * break the app, so anything unparsable falls back to the default.
 */
function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Settings used to persist the admin password in localStorage. That key is
 * dropped on load so an old copy cannot be read from DevTools on a device that
 * still carries it; the password now lives only as a scrypt hash in MongoDB.
 */
function readSettings() {
  const stored = readStorage(STORAGE_KEY_SETTINGS, null);
  if (!stored || typeof stored !== 'object') return defaultSettings;
  const { adminPass: _discardedPassword, ...rest } = stored;
  return { ...defaultSettings, ...rest };
}

/** Rewrites the stored settings without the legacy plaintext password. */
function purgeLegacyStoredPassword() {
  const stored = readStorage(STORAGE_KEY_SETTINGS, null);
  if (!stored || typeof stored !== 'object' || !('adminPass' in stored)) return;
  const { adminPass: _discardedPassword, ...rest } = stored;
  try {
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(rest));
  } catch {
    // Storage can be full or blocked; the in-memory settings are already clean.
  }
}

function migrateYouTubeBranding(categories, products) {
  return {
    categories: categories.map((category) =>
      category.name.toLowerCase() === 'youtube'
        ? { ...category, name: 'WeTV', icon: 'wetv', color: 'text-emerald-300' }
        : category,
    ),
    products: products.map((product) => {
      const categoryWasYouTube = product.category.toLowerCase() === 'youtube';
      const title = product.title.replace(/youtube/gi, 'WeTV');
      return categoryWasYouTube || title !== product.title || product.icon?.toLowerCase().includes('youtube')
        ? {
            ...product,
            category: categoryWasYouTube ? 'WeTV' : product.category,
            title,
            icon: product.icon?.toLowerCase().includes('youtube') ? 'wetv' : product.icon,
          }
        : product;
    }),
  };
}

function formatPrice(amount) {
  return `Rp ${currency.format(amount)}`;
}

function paymentStatusLabel(status) {
  switch (status) {
    case 'paid': return 'Terverifikasi Xendit';
    case 'failed': return 'Gagal';
    case 'expired': return 'Kedaluwarsa';
    case 'review': return 'Perlu ditinjau';
    case 'creating': return 'Menyiapkan pembayaran';
    case 'legacy': return 'Riwayat lokal';
    default: return 'Menunggu pembayaran';
  }
}

function WeTVLogo({ size = 18, className = '' }) {
  const gradientId = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
          <stop stopColor="#28D17C" />
          <stop offset=".52" stopColor="#25BCE8" />
          <stop offset="1" stopColor="#8C54E9" />
        </linearGradient>
      </defs>
      <path d="M5.2 2.8a2 2 0 0 0-3 1.74v14.92a2 2 0 0 0 3 1.74l12.9-7.46a2 2 0 0 0 0-3.48L5.2 2.8Z" fill={`url(#${gradientId})`} />
      <path d="m9.1 8.15 5.2 3.01-5.2 3.01V8.15Z" fill="white" />
    </svg>
  );
}

function iconFor(value, size = 18) {
  const iconClass = 'shrink-0';
  if (value?.toLowerCase().includes('wetv')) return <WeTVLogo size={size} className={iconClass} />;
  if (value?.includes('spotify')) return <Music2 size={size} className={`${iconClass} text-emerald-400`} />;
  if (value?.includes('video')) return <Sparkles size={size} className={`${iconClass} text-cyan-300`} />;
  if (value?.includes('film')) return <Film size={size} className={`${iconClass} text-rose-300`} />;
  if (value?.includes('canva') || value?.includes('pen')) return <PenTool size={size} className={`${iconClass} text-blue-300`} />;
  if (value?.includes('iqiyi') || value?.includes('clapper')) return <Clapperboard size={size} className={`${iconClass} text-emerald-300`} />;
  if (value?.includes('disney') || value?.includes('crown')) return <Sparkles size={size} className={`${iconClass} text-indigo-300`} />;
  if (value?.includes('headphone')) return <Headphones size={size} className={iconClass} />;
  return <Tv size={size} className={`${iconClass} text-red-400`} />;
}

function whatsappUrl(number, message) {
  const cleanNumber = (number || defaultSettings.adminWA).replace(/\D/g, '');
  return `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`;
}

const ProductCard = memo(function ProductCard({ product, index, onCheckout, qrisOpen }) {
  const soldOut = product.stock === 0;
  const orderable = !soldOut && qrisOpen;
  return (
    <article
      className="group card-in magic-shimmer flex flex-col rounded-2xl border border-white/[0.08] bg-[#111114] p-5 transition duration-300 hover:-translate-y-1 hover:border-red-500/30 hover:shadow-glow"
      style={{ animationDelay: `${Math.min(index * 45, 240)}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04]">
          {iconFor(product.icon, 21)}
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
          soldOut
            ? 'border-red-500/20 bg-red-500/[0.08] text-red-300'
            : 'border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-300'
        }`}>
          {soldOut ? 'Habis' : product.stock == null ? 'Siap diproses' : `Stok: ${product.stock}`}
        </span>
      </div>
      <div className="mt-5 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-zinc-500">{product.category}</p>
        <h3 className="mt-2 min-h-12 text-base font-semibold leading-snug text-zinc-100">{product.title}</h3>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-zinc-500">
          <BadgeCheck size={14} className="text-emerald-400" />
          {product.duration}
        </p>
      </div>
      <div className="mt-5 flex items-end justify-between gap-3 border-t border-white/[0.07] pt-4">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">Mulai dari</p>
          <p className="mt-1 text-lg font-bold tracking-tight text-white">{formatPrice(product.price)}</p>
        </div>
        <Button
          size="sm"
          onClick={() => onCheckout(product)}
          className="shrink-0"
          disabled={!orderable}
          title={!qrisOpen && !soldOut ? STORE_CLOSED_MESSAGE : undefined}
        >
          {soldOut ? 'Habis' : !qrisOpen ? 'Tutup' : <>Beli <ArrowRight size={14} /></>}
        </Button>
      </div>
    </article>
  );
});

const HeroSection = memo(function HeroSection({ whatsappNumber }) {
  return (
    <section className="aurora magic-shimmer relative overflow-hidden rounded-[28px] border border-white/[0.09] px-6 py-10 shadow-glow sm:px-10 sm:py-14 lg:px-14">
      <div className="absolute -right-12 -top-16 h-72 w-72 rounded-full bg-red-600/10 blur-3xl" />
      <div className="relative max-w-3xl">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-red-400/20 bg-red-500/[0.08] px-3 py-1.5 text-[11px] font-semibold text-red-200">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
          Akun digital pilihan, transaksi mudah
        </div>
        <h1 className="max-w-2xl text-4xl font-black leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl">
          Hiburan premium,
          <span className="block bg-gradient-to-r from-red-400 via-rose-300 to-white bg-clip-text text-transparent">
            lebih simpel.
          </span>
        </h1>
        <p className="mt-5 max-w-xl text-sm leading-7 text-zinc-300 sm:text-base">
          Temukan akun streaming dan aplikasi digital favoritmu. Pembayaran QRIS, dibantu admin melalui WhatsApp.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Button
            onClick={() => document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' })}
            aria-label="Lihat katalog produk"
          >
            Lihat katalog <ArrowRight size={16} />
          </Button>
          <Button
            as="a"
            variant="secondary"
            href={whatsappUrl(whatsappNumber, 'Halo Admin 2akinoStore, saya ingin bertanya mengenai pemesanan akun digital.')}
            target="_blank"
            rel="noreferrer"
          >
            <Headphones size={16} /> Hubungi admin
          </Button>
        </div>
        <div className="mt-9 flex flex-wrap gap-x-7 gap-y-3 border-t border-white/10 pt-5 text-xs text-zinc-400">
          <span className="flex items-center gap-2"><ShieldCheck size={15} className="text-emerald-400" /> Pilihan terkurasi</span>
          <span className="flex items-center gap-2"><WalletCards size={15} className="text-red-300" /> QRIS 07.00–20.00 WIB</span>
          <span className="flex items-center gap-2"><Headphones size={15} className="text-violet-300" /> Bantuan via WhatsApp</span>
        </div>
      </div>
    </section>
  );
});

const SERVICE_HIGHLIGHTS = [
  { icon: WalletCards, title: 'Pembayaran praktis', text: 'Selesaikan pembayaran melalui QRIS dari aplikasi pilihan Anda.' },
  { icon: BadgeCheck, title: 'Detail jelas', text: 'Informasi paket, harga, durasi, dan garansi tersedia sebelum membeli.' },
  { icon: Headphones, title: 'Dibantu admin', text: 'Konfirmasi pesanan dan kirim bukti pembayaran dengan mudah via WhatsApp.' },
];

const ServiceHighlights = memo(function ServiceHighlights() {
  return (
    <section className="grid gap-4 md:grid-cols-3">
      {SERVICE_HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
        <div key={title} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
          <Icon size={19} className="text-red-300" />
          <h3 className="mt-4 text-sm font-semibold text-white">{title}</h3>
          <p className="mt-2 text-xs leading-5 text-zinc-500">{text}</p>
        </div>
      ))}
    </section>
  );
});

function SectionHeading({ eyebrow, title, description, action }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.22em] text-red-400">{eyebrow}</p>}
        <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h2>
        {description && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">{description}</p>}
      </div>
      {action}
    </div>
  );
}

function App() {
  const [legacyCatalog] = useState(() =>
    migrateYouTubeBranding(
      readStorage(STORAGE_KEY_CATS, defaultCategories),
      readStorage(STORAGE_KEY_PRODS, defaultProducts),
    ),
  );
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [catalogImporting, setCatalogImporting] = useState(false);
  const [transactions, setTransactions] = useState(() => readStorage(STORAGE_KEY_TRANS, []));
  const [adminPayments, setAdminPayments] = useState([]);
  const [adminPaymentsLoading, setAdminPaymentsLoading] = useState(false);
  const [adminPaymentsError, setAdminPaymentsError] = useState('');
  const [settings, setSettings] = useState(readSettings);
  const [activeTab, setActiveTab] = useState('store');
  const [adminTab, setAdminTab] = useState('products');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [clearTransactionsOpen, setClearTransactionsOpen] = useState(false);
  const [clearingTransactions, setClearingTransactions] = useState(false);
  const [editingProductId, setEditingProductId] = useState(null);
  const [checkoutProduct, setCheckoutProduct] = useState(null);
  const [checkoutStep, setCheckoutStep] = useState('form');
  const [invoice, setInvoice] = useState(null);
  const [dynamicQrisPayload, setDynamicQrisPayload] = useState('');
  const [paymentCreating, setPaymentCreating] = useState(false);
  const paymentCreatingRef = useRef(false);
  const [paymentChecking, setPaymentChecking] = useState(false);
  const [paymentStatusError, setPaymentStatusError] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerWA, setCustomerWA] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminLoginPending, setAdminLoginPending] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [adminWANumber, setAdminWANumber] = useState(settings.adminWA || defaultSettings.adminWA);
  const [categoryName, setCategoryName] = useState('');
  const [categoryIcon, setCategoryIcon] = useState('tv');
  const [productCategory, setProductCategory] = useState('');
  const [productTitle, setProductTitle] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [productDuration, setProductDuration] = useState('');
  const [productStock, setProductStock] = useState('');
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [catalogSearchQuery, setCatalogSearchQuery] = useState('');
  const [stockDrafts, setStockDrafts] = useState({});
  const [guideDrafts, setGuideDrafts] = useState({});
  const [categoryGuideDrafts, setCategoryGuideDrafts] = useState({});
  const [trackQuery, setTrackQuery] = useState('');
  const [trackResult, setTrackResult] = useState(null);
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackError, setTrackError] = useState('');
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(interval);
  }, []);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError('');
    try {
      const catalog = await fetchCatalog();
      if (!Array.isArray(catalog.categories) || !Array.isArray(catalog.products)) {
        throw new Error('Format katalog dari server tidak valid.');
      }
      setCategories(catalog.categories);
      setProducts(catalog.products);
      return catalog;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Katalog tidak dapat dimuat.';
      setCatalogError(message);
      throw error;
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCatalog().catch((error) => console.error('Gagal memuat katalog dari server.', error));
  }, [loadCatalog]);

  const loadAdminPayments = useCallback(async () => {
    setAdminPaymentsLoading(true);
    setAdminPaymentsError('');
    try {
      setAdminPayments(await fetchAdminPayments());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Riwayat pembayaran gagal dimuat.';
      setAdminPaymentsError(message);
    } finally {
      setAdminPaymentsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== 'admin' || !isAdminLoggedIn || adminTab !== 'transactions') return undefined;
    loadAdminPayments();
    const interval = window.setInterval(loadAdminPayments, 15000);
    return () => window.clearInterval(interval);
  }, [activeTab, adminTab, isAdminLoggedIn, loadAdminPayments]);

  useEffect(() => {
    if (checkoutStep !== 'qris' || !invoice?.code) return undefined;
    let cancelled = false;
    const checkStatus = async () => {
      try {
        const payment = await fetchPaymentStatus(invoice.code);
        if (cancelled) return;
        setInvoice((current) => current?.code === invoice.code ? { ...current, ...payment } : current);
        setPaymentStatusError('');
        if (payment.status === 'paid') setCheckoutStep('success');
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Status pembayaran gagal dimuat.';
          setPaymentStatusError(message);
        }
      }
    };
    checkStatus();
    const interval = window.setInterval(checkStatus, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [checkoutStep, invoice?.code]);

  useEffect(() => {
    purgeLegacyStoredPassword();
  }, []);

  const persistedKeys = useRef(new Set());
  useEffect(() => {
    if (persistedKeys.current.has(STORAGE_KEY_TRANS)) {
      localStorage.setItem(STORAGE_KEY_TRANS, JSON.stringify(transactions));
    } else {
      persistedKeys.current.add(STORAGE_KEY_TRANS);
    }
  }, [transactions]);
  useEffect(() => {
    if (persistedKeys.current.has(STORAGE_KEY_SETTINGS)) {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
    } else {
      persistedKeys.current.add(STORAGE_KEY_SETTINGS);
    }
  }, [settings]);
  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(''), 3200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  // Pause the decorative shimmer/aurora animations while the tab is hidden so
  // they do not keep repainting in the background.
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => {
      root.classList.toggle('animations-paused', document.hidden);
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      root.classList.remove('animations-paused');
    };
  }, []);

  // Two search boxes filter the catalog on every keystroke. Deferring the
  // query keeps typing responsive: React renders the raw input immediately and
  // re-filters at a lower priority.
  const deferredCatalogSearch = useDeferredValue(catalogSearchQuery);
  const deferredProductSearch = useDeferredValue(productSearchQuery);

  const visibleProducts = useMemo(() => {
    return filterProducts(products, deferredCatalogSearch).filter(
      (product) =>
        selectedCategory === 'All' ||
        product.category.toLowerCase() === selectedCategory.toLowerCase(),
    );
  }, [deferredCatalogSearch, products, selectedCategory]);

  const qrisOpen = isQrisOpen(now);

  const checkoutGuide = useMemo(
    () => resolvePurchaseGuide(checkoutProduct, categories),
    [checkoutProduct, categories],
  );

  const catalogCategories = useMemo(() => {
    const byName = new Map(categories.map((category) => [category.name, category]));
    return ['All', ...categories.map((category) => category.name)].map((name) => {
      const category = byName.get(name);
      return { name, icon: category?.icon };
    });
  }, [categories]);

  const adminProductGroups = useMemo(
    () => groupProductsByCategory(categories, products, deferredProductSearch),
    [categories, products, deferredProductSearch],
  );

  function openAdminAccess() {
    if (isAdminLoggedIn) setActiveTab('admin');
    else setLoginOpen(true);
  }

  /**
   * Verifies the password on the server, which is the only place that holds
   * the scrypt hash. There is deliberately no client-side fallback: anything
   * the browser could compare would have to ship the password in the bundle,
   * where DevTools makes it readable.
   */
  async function handleAdminLogin(event) {
    event.preventDefault();
    const attempt = adminPassword.trim();
    if (!attempt) {
      setNotice('Mohon masukkan password admin.');
      return;
    }
    setAdminLoginPending(true);

    try {
      const result = await loginAdmin(attempt);

      if (result.outcome === 'ok') {
        grantAdminAccess(result.mustChangePassword);
        return;
      }

      if (result.outcome === 'unreachable') {
        setNotice('Server admin tidak terjangkau. Periksa koneksi lalu coba lagi.');
        return;
      }

      setNotice(result.message || 'Password admin salah.');
    } finally {
      setAdminLoginPending(false);
    }
  }

  function grantAdminAccess(mustChange) {
    setIsAdminLoggedIn(true);
    setAdminPassword('');
    setLoginOpen(false);
    setActiveTab('admin');
    setNotice(
      mustChange
        ? 'Berhasil masuk. Password masih default — segera ganti di Pengaturan.'
        : 'Berhasil masuk ke dashboard admin.',
    );
  }

  async function logoutAdmin() {
    await logoutAdminRequest();
    setIsAdminLoggedIn(false);
    setActiveTab('store');
    setNotice('Anda telah keluar dari akses admin.');
  }

  const startCheckout = useCallback((product) => {
    if (!isQrisOpen(new Date())) {
      setNotice(STORE_CLOSED_MESSAGE);
      return;
    }
    setCheckoutProduct(product);
    setCheckoutStep('form');
    setInvoice(null);
    setDynamicQrisPayload('');
    setPaymentStatusError('');
    setCustomerName('');
    setCustomerWA('');
  }, []);

  async function processToQRIS(event) {
    event.preventDefault();
    if (paymentCreatingRef.current) return;
    if (!customerName.trim() || !customerWA.trim()) {
      setNotice('Mohon isi nama lengkap dan nomor WhatsApp Anda.');
      return;
    }
    if (!checkoutProduct) return;
    if (!isQrisOpen(new Date())) {
      setNotice(STORE_CLOSED_MESSAGE);
      return;
    }

    paymentCreatingRef.current = true;
    setPaymentCreating(true);
    setPaymentStatusError('');
    try {
      const createdInvoice = await createPayment({
        productId: checkoutProduct.id,
        customerName: customerName.trim(),
        customerWA: customerWA.trim(),
      });
      setInvoice({
        ...createdInvoice,
        customerName: customerName.trim(),
        customerWA: customerWA.trim(),
        productId: checkoutProduct.id,
      });
      setDynamicQrisPayload(createdInvoice.qrCode);
      setCheckoutStep('qris');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'QRIS gagal dibuat. Silakan hubungi admin.';
      setPaymentStatusError(message);
    } finally {
      paymentCreatingRef.current = false;
      setPaymentCreating(false);
    }
  }

  async function confirmPayment() {
    if (!invoice) return;
    setPaymentChecking(true);
    setPaymentStatusError('');
    try {
      const payment = await fetchPaymentStatus(invoice.code);
      setInvoice((current) => current?.code === invoice.code ? { ...current, ...payment } : current);
      if (payment.status === 'paid') setCheckoutStep('success');
      else setNotice('Pembayaran belum terkonfirmasi oleh Xendit. Status akan diperbarui otomatis.');
    } catch (error) {
      setPaymentStatusError(error instanceof Error ? error.message : 'Status pembayaran gagal dimuat.');
    } finally {
      setPaymentChecking(false);
    }
  }

  async function searchPayment(event) {
    event.preventDefault();
    setTrackLoading(true);
    setTrackError('');
    setTrackResult(null);
    try {
      setTrackResult(await fetchPaymentStatus(trackQuery.trim()));
    } catch (error) {
      setTrackError(error instanceof Error ? error.message : 'Pesanan tidak dapat dicari.');
    } finally {
      setTrackLoading(false);
    }
  }

  async function importLegacyCatalog() {
    if (categories.length || products.length || catalogImporting) return;
    setCatalogImporting(true);
    try {
      const result = await migrateLegacyCatalog(legacyCatalog.categories, legacyCatalog.products);
      await loadCatalog();
      setNotice(
        `Katalog berhasil diimpor: ${result.importedCategories} kategori dan ${result.importedProducts} produk baru.`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Impor katalog gagal.');
    } finally {
      setCatalogImporting(false);
    }
  }

  async function addCategory(event) {
    event.preventDefault();
    const cleanName = categoryName.trim();
    if (!cleanName) {
      setNotice('Nama kategori tidak boleh kosong.');
      return;
    }
    try {
      const category = await createCatalogCategory({ name: cleanName, icon: categoryIcon, color: 'text-amber-300' });
      setCategories((current) => [...current, category]);
      setCategoryName('');
      setCategoryOpen(false);
      setNotice(`Kategori ${cleanName} berhasil ditambahkan.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Kategori tidak dapat ditambahkan.');
    }
  }

  function openAddProduct() {
    setEditingProductId(null);
    setProductCategory(categories[0]?.name || '');
    setProductTitle('');
    setProductPrice('');
    setProductDuration('');
    setProductStock('');
    setProductOpen(true);
  }

  function openEditProduct(product) {
    setEditingProductId(product.id);
    setProductCategory(product.category);
    setProductTitle(product.title);
    setProductPrice(String(product.price));
    setProductDuration(product.duration);
    setProductStock(product.stock == null ? '' : String(product.stock));
    setProductOpen(true);
  }

  async function addProduct(event) {
    event.preventDefault();
    const price = Number(productPrice);
    if (!productTitle.trim() || !Number.isSafeInteger(price) || price <= 0 || !productDuration.trim() || !productCategory) {
      setNotice('Mohon isi semua data produk dengan benar.');
      return;
    }
    let stock;
    try {
      stock = normalizeStockInput(productStock);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Stok produk tidak valid.');
      return;
    }
    const category = categories.find((item) => item.name === productCategory);
    try {
      if (editingProductId) {
        const updated = await updateCatalogProduct(editingProductId, {
          category: productCategory,
          title: productTitle.trim(),
          price,
          duration: productDuration.trim(),
          stock,
          icon: category?.icon || 'tv',
        });
        setProducts((current) => current.map((item) => (item.id === editingProductId ? updated : item)));
        setProductOpen(false);
        setEditingProductId(null);
        setNotice(`Produk ${productTitle.trim()} berhasil diperbarui.`);
        return;
      }
      const product = await createCatalogProduct({
        category: productCategory,
        title: productTitle.trim(),
        price,
        duration: productDuration.trim(),
        stock,
        icon: category?.icon || 'tv',
      });
      setProducts((current) => [...current, product]);
      setProductOpen(false);
      setNotice(`Produk ${productTitle.trim()} berhasil ditambahkan.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Produk tidak dapat ditambahkan.');
    }
  }

  async function deleteProduct(productId) {
    if (!window.confirm('Apakah Anda yakin ingin menghapus produk ini?')) return;
    try {
      await removeCatalogProduct(productId);
      setProducts((current) => current.filter((product) => product.id !== productId));
      setNotice('Produk berhasil dihapus.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Produk tidak dapat dihapus.');
    }
  }

  async function saveProductStock(productId) {
    const product = products.find((item) => item.id === productId);
    if (!product) return;

    let stock;
    try {
      stock = normalizeStockInput(stockDrafts[productId] ?? (product.stock == null ? '' : String(product.stock)));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Stok produk tidak valid.');
      return;
    }
    try {
      const updated = await updateCatalogProduct(productId, { stock });
      setProducts((current) => current.map((item) => (item.id === productId ? updated : item)));
      setStockDrafts((current) => ({ ...current, [productId]: stock == null ? '' : String(stock) }));
      setNotice(stock == null ? 'Produk sekarang memiliki stok tak terbatas.' : `Stok diperbarui menjadi ${stock}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Stok produk tidak dapat disimpan.');
    }
  }

  async function saveProductGuide(productId) {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    const draft = guideDrafts[productId] ?? product.guide ?? '';
    try {
      const updated = await updateCatalogProduct(productId, { guide: draft.trim() });
      setProducts((current) => current.map((item) => (item.id === productId ? updated : item)));
      setGuideDrafts((current) => ({ ...current, [productId]: draft.trim() }));
      setNotice(
        draft.trim()
          ? `Panduan pembelian untuk ${product.title} disimpan.`
          : `Panduan ${product.title} dikosongkan; produk ini memakai panduan kategori bila ada.`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Panduan produk tidak dapat disimpan.');
    }
  }

  async function saveCategoryGuide(categoryName) {
    const category = categories.find((item) => item.name === categoryName);
    if (!category) return;
    const draft = categoryGuideDrafts[categoryName] ?? category.guide ?? '';
    try {
      const updated = await updateCatalogCategory(categoryName, { guide: draft.trim() });
      setCategories((current) => current.map((item) => (item.name === categoryName ? updated : item)));
      setCategoryGuideDrafts((current) => ({ ...current, [categoryName]: draft.trim() }));
      setNotice(`Panduan kategori ${categoryName} disimpan.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Panduan kategori tidak dapat disimpan.');
    }
  }

  async function deleteCategory(categoryName) {
    const linkedProductCount = products.filter(
      (product) => product.category.toLocaleLowerCase() === categoryName.toLocaleLowerCase(),
    ).length;
    if (linkedProductCount > 0) {
      setNotice(`Tidak dapat menghapus kategori: ${linkedProductCount} produk masih terhubung. Hapus atau pindahkan produk terlebih dahulu.`);
      return;
    }
    if (!window.confirm(`Hapus kategori "${categoryName}"? Tindakan ini tidak dapat dibatalkan.`)) return;

    try {
      await removeCatalogCategory(categoryName);
      setCategories((current) => current.filter((category) => category.name !== categoryName));
      setNotice(`Kategori ${categoryName} berhasil dihapus.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Kategori tidak dapat dihapus.');
    }
  }

  /**
   * Saves the admin settings. The WhatsApp number stays browser-local, but a
   * new password is written to MongoDB through the server, so the change
   * applies on every device instead of only the current browser. The password
   * itself is never stored locally.
   */
  async function saveAdminSettings(event) {
    event.preventDefault();
    const cleanNumber = adminWANumber.trim();
    if (!cleanNumber) {
      setNotice('Nomor WhatsApp admin tidak boleh kosong.');
      return;
    }

    const nextPassword = newPassword.trim();
    if (nextPassword) {
      if (!currentPassword.trim()) {
        setNotice('Masukkan password admin saat ini untuk mengubahnya.');
        return;
      }
      setSettingsSaving(true);
      try {
        const result = await changeAdminPassword(currentPassword.trim(), nextPassword);

        if (result.outcome === 'invalid' || result.outcome === 'error') {
          setNotice(result.message);
          return;
        }
        if (result.outcome === 'unreachable') {
          setNotice('Server tidak terjangkau. Password tidak diubah.');
          return;
        }
        setNotice('Password admin tersimpan di database.');
      } finally {
        setSettingsSaving(false);
      }
    } else {
      setNotice('Pengaturan admin berhasil disimpan.');
    }

    setSettings((current) => ({ ...current, adminWA: cleanNumber }));
    setNewPassword('');
    setCurrentPassword('');
  }

  function downloadTransactions() {
    if (adminTransactionRows.length === 0 && transactions.length === 0) {
      setNotice('Belum ada data transaksi untuk diunduh.');
      return;
    }
    const rows = [
      ['Invoice', 'Tanggal', 'Nama Pembeli', 'Nomor WA', 'Produk', 'Total Harga', 'Status'],
      ...adminPayments.map((payment) => [
        payment.invoiceCode,
        payment.createdAt ? new Date(payment.createdAt).toLocaleString('id-ID') : '',
        payment.customerName,
        payment.customerWA,
        payment.productTitle,
        payment.amount,
        paymentStatusLabel(payment.status),
      ]),
      ...transactions.map((transaction) => [
        transaction.code,
        transaction.date,
        transaction.customerName,
        transaction.customerWA,
        transaction.productTitle,
        transaction.amount,
        'Riwayat lokal lama; status tidak diverifikasi Xendit',
      ]),
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(','))
      .join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = 'Laporan_Penjualan_2akinoStore.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
  }

  function clearAllTransactions() {
    if (clearingTransactions) return;
    setClearingTransactions(true);
    try {
      localStorage.setItem(STORAGE_KEY_TRANS, JSON.stringify([]));
      setTransactions([]);
      setClearTransactionsOpen(false);
      setNotice('Riwayat lokal di browser ini berhasil dihapus.');
    } catch (error) {
      console.error('Gagal menghapus seluruh riwayat transaksi.', error);
      setNotice('Riwayat transaksi gagal dihapus. Data belum diubah.');
    } finally {
      setClearingTransactions(false);
    }
  }


  const activeWhatsApp = settings.adminWA || defaultSettings.adminWA;
  const adminTransactionRows = [
    ...adminPayments.map((payment) => ({
      ...payment,
      code: payment.invoiceCode,
      date: payment.createdAt ? new Date(payment.createdAt).toLocaleString('id-ID') : '',
      source: 'xendit',
    })),
    ...transactions.map((transaction) => ({ ...transaction, status: 'legacy', source: 'legacy' })),
  ];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-[#09090b]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-2 px-3 max-[360px]:gap-1 max-[360px]:px-2 sm:gap-4 sm:px-6">
          <Button
            variant="unstyled"
            size="none"
            type="button"
            onClick={() => setActiveTab('store')}
            className="flex items-center gap-2 text-left sm:gap-3"
            aria-label="Kembali ke toko 2akinoStore"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white shadow-lg shadow-red-950/50 max-[360px]:h-8 max-[360px]:w-8 sm:h-10 sm:w-10">
              <MonitorPlay size={21} />
            </span>
            <span className="min-w-0">
              <span className="block whitespace-nowrap text-sm font-black tracking-[0.06em] text-white max-[360px]:text-xs sm:text-base sm:tracking-[0.1em]">
                2AKINO<span className="text-red-500">STORE</span>
              </span>
              <span className="hidden text-[10px] tracking-wide text-zinc-500 sm:block">Akun digital, tanpa ribet</span>
            </span>
          </Button>

          <nav className="min-w-0" aria-label="Navigasi utama">
            <RubberSegment
              items={[
                { value: 'store', label: 'Toko', icon: <ShoppingBag size={14} /> },
                { value: 'track', label: 'Pesanan', icon: <Search size={14} /> },
                { value: 'admin', label: 'Admin', icon: <Settings2 size={14} /> },
              ]}
              value={activeTab}
              onChange={(value) => {
                if (value === 'admin') openAdminAccess();
                else setActiveTab(value);
              }}
              trackColor="#27272a"
              thumbColor="#fafafa"
              textColor="#fafafa"
              activeTextColor="#18181b"
              size="md"
              radius={10}
              inset={3}
              equalSlots
              stretch={100}
              squash={3}
              speed={1}
              glide={75}
              draggable
              aria-label="Navigasi utama"
            />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
        {activeTab === 'store' && (
          <div className="space-y-12 fade-in">
            <HeroSection whatsappNumber={activeWhatsApp} />

            <section id="catalog">
              <SectionHeading
                eyebrow="Katalog pilihan"
                title="Pilih yang kamu suka"
                description="Jelajahi paket digital pilihan dan temukan yang paling sesuai."
                action={
                  <span className="text-xs text-zinc-500" aria-live="polite">
                    {catalogLoading
                      ? 'Memuat katalog...'
                      : catalogError
                        ? 'Katalog tidak tersedia'
                        : `${visibleProducts.length} produk ditemukan`}
                  </span>
                }
              />
              {catalogLoading && (
                <div role="status" className="rounded-2xl border border-white/[0.08] bg-[#111114] py-16 text-center text-sm text-zinc-400">
                  Memuat katalog produk...
                </div>
              )}
              {catalogError && (
                <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/[0.05] p-6 text-center">
                  <p className="text-sm font-semibold text-red-200">Katalog tidak dapat dimuat</p>
                  <p className="text-xs text-zinc-400">{catalogError}</p>
                  <Button variant="secondary" size="sm" onClick={() => loadCatalog().catch((error) => console.error('Gagal memuat katalog dari server.', error))}>
                    Coba lagi
                  </Button>
                </div>
              )}
              {!catalogLoading && !catalogError && (
                <>
              {!qrisOpen && (
                <div
                  role="status"
                  className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] p-4 text-xs leading-relaxed text-amber-100"
                >
                  <Clock3 size={16} className="mt-0.5 shrink-0 text-amber-300" aria-hidden="true" />
                  <span>
                    <strong className="font-semibold text-amber-200">Toko sedang tutup.</strong>{' '}
                    {STORE_CLOSED_MESSAGE}
                  </span>
                </div>
              )}
              <div className="mb-5 rounded-2xl border border-white/[0.08] bg-[#111114] p-4 sm:p-5">
                <label htmlFor="catalog-search" className="text-xs font-semibold text-zinc-300">
                  Cari produk
                </label>
                <div className="relative mt-2">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
                    aria-hidden="true"
                  />
                  <input
                    id="catalog-search"
                    type="search"
                    className={`${inputClass} mt-0 pl-10`}
                    value={catalogSearchQuery}
                    onChange={(event) => setCatalogSearchQuery(event.target.value)}
                    placeholder="Cari nama produk, kategori, atau durasi..."
                  />
                </div>
              </div>
              <div className="scrollbar-none mb-6 flex gap-2 overflow-x-auto pb-2" role="group" aria-label="Filter kategori produk">
                {catalogCategories.map(({ name, icon }) => {
                  const active = selectedCategory === name;
                  return (
                    <Button
                      variant="unstyled"
                      size="none"
                      type="button"
                      key={name}
                      onClick={() => setSelectedCategory(name)}
                      className={`flex h-10 shrink-0 items-center gap-2 rounded-xl border border-solid px-4 text-xs font-semibold transition ${
                        active
                          ? '!border-red-500/40 bg-red-600 text-white shadow-lg shadow-red-950/30'
                          : '!border-white/20 bg-white/[0.04] text-zinc-200 hover:!border-white/40 hover:bg-white/[0.08] hover:text-white'
                      }`}
                    >
                      {name === 'All' ? <Package size={15} /> : iconFor(icon, 15)}
                      {name === 'All' ? 'Semua produk' : name}
                    </Button>
                  );
                })}
              </div>
              {visibleProducts.length ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {visibleProducts.map((product, index) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      index={index}
                      onCheckout={startCheckout}
                      qrisOpen={qrisOpen}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 py-16 text-center">
                  <p className="text-sm font-semibold text-zinc-300">
                    {catalogSearchQuery.trim()
                      ? 'Produk tidak ditemukan'
                      : categories.length === 0 && products.length === 0
                        ? 'Katalog belum memiliki produk'
                        : 'Belum ada produk pada kategori ini'}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {catalogSearchQuery.trim()
                      ? 'Coba kata kunci lain atau ubah filter kategori.'
                      : categories.length === 0 && products.length === 0
                        ? 'Admin dapat masuk ke dashboard untuk mengimpor data katalog lama.'
                        : 'Pilih kategori lain untuk melihat produk yang tersedia.'}
                  </p>
                  {(catalogSearchQuery.trim() || selectedCategory !== 'All') && (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-4"
                      onClick={() => {
                        setCatalogSearchQuery('');
                        setSelectedCategory('All');
                      }}
                    >
                      Hapus pencarian dan filter
                    </Button>
                  )}
                </div>
              )}
                </>
              )}
            </section>

            <ServiceHighlights />
          </div>
        )}

        {activeTab === 'track' && (
          <section className="mx-auto max-w-2xl pt-5 sm:pt-12 slide-in">
            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10 text-red-300">
                <Search size={20} />
              </div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-red-400">Pelacakan pesanan</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">Cek detail pesanan</h1>
              <p className="mt-3 text-sm text-zinc-400">Gunakan ID invoice untuk melihat status langsung dari server pembayaran.</p>
            </div>
            <form onSubmit={searchPayment} className="rounded-2xl border border-white/[0.08] bg-[#111114] p-4 sm:p-6">
              <label htmlFor="track-query" className="text-xs font-semibold text-zinc-300">ID Invoice</label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  id="track-query"
                  className={`${inputClass} mt-0 flex-1`}
                  value={trackQuery}
                  onChange={(event) => {
                    setTrackQuery(event.target.value);
                    setTrackResult(null);
                    setTrackError('');
                  }}
                  placeholder="Contoh: INV-0123456789ABCDEF"
                />
                <Button type="submit" disabled={trackLoading}>
                  <Search size={16} /> {trackLoading ? 'Mencari…' : 'Cari pesanan'}
                </Button>
              </div>
            </form>
            {trackError && (
              <div role="alert" className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-5 text-center text-sm text-amber-100">
                {trackError}
              </div>
            )}
            {trackResult && (
              <div className="mt-5 space-y-3">
                <article className="rounded-2xl border border-white/[0.08] bg-[#111114] p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.07] pb-4">
                    <div>
                      <span className="font-mono text-xs font-bold text-red-300">{trackResult.code}</span>
                      <h2 className="mt-1 font-semibold text-white">{trackResult.productTitle}</h2>
                      <p className="mt-1 text-xs text-zinc-500">
                        {trackResult.date ? new Date(trackResult.date).toLocaleString('id-ID') : ''}
                      </p>
                      <p className="mt-2 text-sm font-semibold text-emerald-300">{formatPrice(trackResult.amount)}</p>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${
                      trackResult.status === 'paid'
                        ? 'border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-300'
                        : trackResult.status === 'failed' || trackResult.status === 'expired'
                          ? 'border-red-500/20 bg-red-500/[0.08] text-red-300'
                          : 'border-amber-500/20 bg-amber-500/[0.08] text-amber-300'
                    }`}>
                      {paymentStatusLabel(trackResult.status)}
                    </span>
                  </div>
                  {trackResult.status !== 'paid' && (
                    <Button
                      as="a"
                      variant="success"
                      size="sm"
                      className="mt-4 h-10 w-full"
                      href={whatsappUrl(activeWhatsApp, `Halo Admin, saya membutuhkan bantuan terkait Invoice ${trackResult.code} (${trackResult.productTitle}).`)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Headphones size={15} /> Hubungi admin
                    </Button>
                  )}
                </article>
              </div>
            )}
          </section>
        )}

        {activeTab === 'admin' && isAdminLoggedIn && (
          <section className="slide-in">
            <div className="mb-7 flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-red-400">Workspace</p>
                <h1 className="mt-2 text-2xl font-bold text-white">Dashboard admin</h1>
                <p className="mt-1 text-sm text-zinc-500">Kelola katalog, transaksi, dan pengaturan toko.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => setCategoryOpen(true)}><FolderPlus size={15} /> Kategori</Button>
                <Button size="sm" onClick={openAddProduct}><Plus size={15} /> Produk</Button>
                <Button variant="ghost" size="sm" onClick={logoutAdmin}>Keluar</Button>
              </div>
            </div>

            {!catalogLoading && !catalogError && categories.length === 0 && products.length === 0 && (
              <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-sky-500/20 bg-sky-500/[0.05] p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-sky-100">Katalog MongoDB masih kosong</p>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                    Impor kategori dan produk yang tersimpan di browser ini. Data yang sudah ada tidak akan ditimpa.
                  </p>
                </div>
                <Button size="sm" onClick={importLegacyCatalog} disabled={catalogImporting}>
                  {catalogImporting ? 'Mengimpor...' : 'Impor katalog lama'}
                </Button>
              </div>
            )}

            <div className="mb-6 flex gap-1 overflow-x-auto border-b border-white/[0.07]">
              {[
                { id: 'products', label: 'Daftar produk', icon: Package },
                { id: 'transactions', label: 'Transaksi', icon: WalletCards },
                { id: 'settings', label: 'Pengaturan', icon: Settings2 },
              ].map(({ id, label, icon: Icon }) => (
                <Button
                  variant="unstyled"
                  size="none"
                  key={id}
                  type="button"
                  onClick={() => setAdminTab(id)}
                  className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition ${
                    adminTab === id ? 'border-red-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-200'
                  }`}
                >
                  <Icon size={15} /> {label}
                </Button>
              ))}
            </div>

            {adminTab === 'products' && (
              <div className="space-y-5">
                <div className="rounded-2xl border border-white/[0.08] bg-[#111114] p-4 sm:p-5">
                  <label htmlFor="admin-product-search" className="text-xs font-semibold text-zinc-300">Cari produk</label>
                  <div className="relative mt-2">
                    <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input
                      id="admin-product-search"
                      type="search"
                      className={`${inputClass} mt-0 pl-10`}
                      value={productSearchQuery}
                      onChange={(event) => setProductSearchQuery(event.target.value)}
                      placeholder="Cari berdasarkan nama, kategori, atau durasi..."
                    />
                  </div>
                  {productSearchQuery && (
                    <p className="mt-2 text-[11px] text-zinc-500">
                      {adminProductGroups.total} produk ditemukan
                    </p>
                  )}
                </div>
                {adminProductGroups.groups.map(({ category, products: categoryProducts }) => {
                  if (productSearchQuery.trim() && categoryProducts.length === 0) return null;
                  return (
                    <section key={category.name} className="rounded-2xl border border-white/[0.08] bg-[#111114] p-5">
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] pb-4">
                        <h2 className="flex items-center gap-2 text-sm font-semibold text-white">{iconFor(category.icon, 17)} {category.name}</h2>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-zinc-500">{categoryProducts.length} produk</span>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => deleteCategory(category.name)}
                            aria-label={`Hapus kategori ${category.name}`}
                          >
                            <Trash2 size={13} /> Hapus kategori
                          </Button>
                        </div>
                      </div>
                      <div className="mb-4 rounded-xl border border-white/[0.06] bg-black/20 p-3">
                        <label htmlFor={`category-guide-${category.name}`} className="flex items-center gap-2 text-[11px] font-semibold text-sky-200">
                          <BookOpen size={13} aria-hidden="true" /> Panduan pembelian kategori ini
                        </label>
                        <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">
                          Dipakai untuk semua produk di kategori ini yang belum punya panduan sendiri.
                        </p>
                        <textarea
                          id={`category-guide-${category.name}`}
                          rows={2}
                          className={`${inputClass} mt-2 min-h-16 resize-y py-2 leading-relaxed`}
                          aria-label={`Panduan pembelian kategori ${category.name}`}
                          placeholder="Contoh: Login memakai email sendiri, lalu kirim nama profil ke admin."
                          value={categoryGuideDrafts[category.name] ?? category.guide ?? ''}
                          onChange={(event) => setCategoryGuideDrafts((current) => ({ ...current, [category.name]: event.target.value }))}
                        />
                        <div className="mt-2 flex items-center justify-between gap-3">
                          <span className="text-[10px] text-zinc-500">
                            {(categoryGuideDrafts[category.name] ?? category.guide ?? '').trim()
                              ? 'Panduan aktif untuk kategori ini.'
                              : 'Kosong: panduan kategori tidak ditampilkan.'}
                          </span>
                          <Button size="sm" variant="secondary" className="h-8 shrink-0" onClick={() => saveCategoryGuide(category.name)}>
                            Simpan panduan
                          </Button>
                        </div>
                      </div>
                      {categoryProducts.length ? (
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {categoryProducts.map((product) => (
                            <div key={product.id} className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-semibold text-zinc-200">{product.title}</p>
                                  <p className="mt-1 text-[11px] text-zinc-500">{product.duration}</p>
                                  <p className="mt-3 text-sm font-bold text-red-300">{formatPrice(product.price)}</p>
                                </div>
                                <div className="flex shrink-0 gap-1">
                                  <Button variant="secondary" size="icon" className="h-8 w-8" onClick={() => openEditProduct(product)} aria-label={`Edit ${product.title}`}>
                                    <Pencil size={14} />
                                  </Button>
                                  <Button variant="danger" size="icon" className="h-8 w-8" onClick={() => deleteProduct(product.id)} aria-label={`Hapus ${product.title}`}>
                                    <Trash2 size={14} />
                                  </Button>
                                </div>
                              </div>
                              <div className="mt-4 border-t border-white/[0.06] pt-3">
                                <label htmlFor={`product-stock-${product.id}`} className="flex items-center justify-between gap-2 text-[11px] font-semibold text-zinc-400">
                                  Stok
                                  <span className={product.stock === 0 ? 'text-red-300' : product.stock == null ? 'text-emerald-300' : 'text-zinc-300'}>
                                    {product.stock === 0 ? 'Habis' : product.stock == null ? 'Tak terbatas' : `${product.stock} tersedia`}
                                  </span>
                                </label>
                                <div className="mt-2 flex gap-2">
                                  <input
                                    id={`product-stock-${product.id}`}
                                    type="number"
                                    min="0"
                                    step="1"
                                    className={`${inputClass} mt-0 h-9`}
                                    aria-label={`Stok ${product.title}`}
                                    placeholder="Kosong = tak terbatas"
                                    value={stockDrafts[product.id] ?? (product.stock == null ? '' : String(product.stock))}
                                    onChange={(event) => setStockDrafts((current) => ({ ...current, [product.id]: event.target.value }))}
                                  />
                                  <Button size="sm" className="h-9 shrink-0" onClick={() => saveProductStock(product.id)}>Simpan</Button>
                                </div>
                              </div>
                              <div className="mt-3 border-t border-white/[0.06] pt-3">
                                <label htmlFor={`product-guide-${product.id}`} className="flex items-center gap-2 text-[11px] font-semibold text-sky-200">
                                  <BookOpen size={13} aria-hidden="true" /> Panduan produk ini
                                </label>
                                <textarea
                                  id={`product-guide-${product.id}`}
                                  rows={2}
                                  className={`${inputClass} mt-2 min-h-16 resize-y py-2 leading-relaxed`}
                                  aria-label={`Panduan pembelian ${product.title}`}
                                  placeholder="Kosongkan untuk memakai panduan kategori."
                                  value={guideDrafts[product.id] ?? product.guide ?? ''}
                                  onChange={(event) => setGuideDrafts((current) => ({ ...current, [product.id]: event.target.value }))}
                                />
                                <div className="mt-2 flex items-center justify-between gap-3">
                                  <span className="text-[10px] text-zinc-500">
                                    {(guideDrafts[product.id] ?? product.guide ?? '').trim()
                                      ? 'Panduan produk ini aktif.'
                                      : category.guide?.trim()
                                        ? 'Kosong: memakai panduan kategori.'
                                        : 'Kosong: tidak ada panduan.'}
                                  </span>
                                  <Button size="sm" variant="secondary" className="h-8 shrink-0" onClick={() => saveProductGuide(product.id)}>
                                    Simpan panduan
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : <p className="text-xs italic text-zinc-600">Belum ada produk dalam kategori ini.</p>}
                    </section>
                  );
                })}
                {productSearchQuery.trim() && adminProductGroups.total === 0 && (
                  <div className="rounded-2xl border border-dashed border-white/10 py-12 text-center">
                    <p className="text-sm font-semibold text-zinc-300">Produk tidak ditemukan</p>
                    <p className="mt-1 text-xs text-zinc-500">Coba kata kunci nama, kategori, atau durasi yang berbeda.</p>
                  </div>
                )}
              </div>
            )}

            {adminTab === 'transactions' && (
              <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111114]">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.07] p-5">
                  <div>
                    <h2 className="text-sm font-semibold text-white">Riwayat transaksi</h2>
                    <p className="mt-1 text-xs text-zinc-500">
                      {adminPayments.length} pembayaran server · {transactions.length} riwayat lokal lama
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" onClick={loadAdminPayments} disabled={adminPaymentsLoading}>
                      <RefreshCw size={15} className={adminPaymentsLoading ? 'animate-spin' : ''} />
                      {adminPaymentsLoading ? 'Memuat…' : 'Segarkan'}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={downloadTransactions}>
                      <ArrowDownToLine size={15} /> Unduh CSV
                    </Button>
                    {transactions.length > 0 && (
                      <Button variant="danger" size="sm" onClick={() => setClearTransactionsOpen(true)}>
                        <Trash2 size={15} /> Hapus Riwayat Lokal
                      </Button>
                    )}
                  </div>
                </div>
                {adminPaymentsError && (
                  <div role="alert" className="border-b border-red-500/15 bg-red-500/[0.05] p-4 text-xs text-red-200">
                    {adminPaymentsError}
                  </div>
                )}
                {adminTransactionRows.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-left text-xs">
                      <thead className="bg-white/[0.025] text-[10px] uppercase tracking-wider text-zinc-500">
                        <tr>{['Invoice', 'Tanggal', 'Pembeli', 'Produk', 'Total', 'Status', 'Aksi'].map((label) => <th key={label} className="px-4 py-3 font-semibold">{label}</th>)}</tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.06] text-zinc-300">
                        {adminTransactionRows.map((transaction, index) => (
                          <tr key={`${transaction.code}-${transaction.source}-${index}`}>
                            <td className="px-4 py-4 font-mono font-semibold text-red-300">{transaction.code}</td>
                            <td className="px-4 py-4 text-zinc-500">{transaction.date}</td>
                            <td className="px-4 py-4">{transaction.customerName}<span className="mt-1 block text-[10px] text-zinc-500">{transaction.customerWA}</span></td>
                            <td className="px-4 py-4">{transaction.productTitle}</td>
                            <td className="px-4 py-4 font-semibold text-emerald-300">{formatPrice(transaction.amount)}</td>
                            <td className="px-4 py-4">
                              <span className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-bold ${
                                transaction.status === 'paid' && transaction.fulfillmentStatus !== 'needs_attention'
                                  ? 'border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-300'
                                  : transaction.status === 'paid' && transaction.fulfillmentStatus === 'needs_attention'
                                    ? 'border-orange-500/20 bg-orange-500/[0.08] text-orange-300'
                                  : transaction.status === 'failed' || transaction.status === 'expired'
                                    ? 'border-red-500/20 bg-red-500/[0.08] text-red-300'
                                    : transaction.status === 'legacy'
                                      ? 'border-zinc-500/20 bg-zinc-500/[0.08] text-zinc-300'
                                      : 'border-amber-500/20 bg-amber-500/[0.08] text-amber-300'
                              }`}>
                                {transaction.status === 'paid' && transaction.fulfillmentStatus === 'needs_attention'
                                  ? 'Terverifikasi · periksa stok'
                                  : paymentStatusLabel(transaction.status)}
                              </span>
                            </td>
                            <td className="space-y-2 px-4 py-4">
                              <a className="block whitespace-nowrap font-semibold text-emerald-300 hover:text-emerald-200" href={whatsappUrl(transaction.customerWA, `Halo ${transaction.customerName}, terkait pesanan Invoice ${transaction.code} (${transaction.productTitle}).`)} target="_blank" rel="noreferrer">Chat pembeli</a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="p-8 text-center text-sm text-zinc-500">{adminPaymentsLoading ? 'Memuat transaksi…' : 'Belum ada transaksi.'}</p>}
              </section>
            )}

            {adminTab === 'settings' && (
              <form onSubmit={saveAdminSettings} className="max-w-xl space-y-6 rounded-2xl border border-white/[0.08] bg-[#111114] p-5 sm:p-6">
                <div>
                  <label htmlFor="admin-wa" className="flex items-center gap-2 text-sm font-semibold text-white"><Headphones size={16} className="text-emerald-400" /> Nomor WhatsApp admin</label>
                  <p className="mt-1 text-xs text-zinc-500">Gunakan format internasional, misalnya 628123456789.</p>
                  <input id="admin-wa" className={inputClass} value={adminWANumber} onChange={(event) => setAdminWANumber(event.target.value)} placeholder="628123456789" />
                </div>
                <div className="border-t border-white/[0.07] pt-5">
                  <label htmlFor="admin-new-password" className="flex items-center gap-2 text-sm font-semibold text-white"><KeyRound size={16} className="text-amber-300" /> Ubah password admin</label>
                  <p className="mt-1 text-xs text-zinc-500">
                    Password disimpan di database dan berlaku untuk semua perangkat. Kosongkan
                    kedua kolom jika tidak ingin mengubah password.
                  </p>
                  <input
                    id="admin-current-password"
                    type="password"
                    autoComplete="current-password"
                    className={inputClass}
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    placeholder="Password saat ini"
                  />
                  <input
                    id="admin-new-password"
                    type="password"
                    autoComplete="new-password"
                    className={`${inputClass} mt-3`}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="Password baru (minimal 8 karakter)"
                  />
                </div>
                <Button type="submit" disabled={settingsSaving}>
                  <Check size={16} /> {settingsSaving ? 'Menyimpan…' : 'Simpan pengaturan'}
                </Button>
              </form>
            )}
          </section>
        )}
      </main>

      <footer className="border-t border-white/[0.07]">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-zinc-600 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>© {new Date().getFullYear()} 2akinoStore. Akun digital pilihanmu.</span>
          <span className="flex items-center gap-1.5"><ShieldCheck size={13} /> Butuh bantuan? Hubungi admin via WhatsApp.</span>
        </div>
      </footer>

      <Button
        as="a"
        variant="success"
        size="icon"
        href={whatsappUrl(activeWhatsApp, 'Halo Admin 2akinoStore, saya ingin bertanya mengenai pemesanan akun digital.')}
        target="_blank"
        rel="noreferrer"
        aria-label="Hubungi admin melalui WhatsApp"
        className="fixed bottom-5 right-5 z-30 h-12 w-12 rounded-full shadow-xl shadow-emerald-950/40 hover:scale-105 motion-safe:transition-transform"
        style={{ bottom: 'calc(1.25rem + env(safe-area-inset-bottom))', right: 'calc(1.25rem + env(safe-area-inset-right))' }}
      >
        <Headphones size={20} />
      </Button>

      <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Masuk dashboard admin</DialogTitle>
            <DialogDescription>Masukkan password admin untuk mengelola toko.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAdminLogin} className="space-y-4">
            <label htmlFor="admin-password" className="text-xs font-semibold text-zinc-300">Password admin</label>
            <input
              id="admin-password"
              autoFocus
              type="password"
              autoComplete="current-password"
              className={inputClass}
              value={adminPassword}
              onChange={(event) => setAdminPassword(event.target.value)}
              placeholder="Masukkan password"
            />
            <Button className="w-full" type="submit" disabled={adminLoginPending}>
              <LockKeyhole size={16} /> {adminLoginPending ? 'Memeriksa…' : 'Masuk'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={categoryOpen} onOpenChange={setCategoryOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Tambah kategori</DialogTitle>
            <DialogDescription>Buat kategori baru untuk mengelompokkan produk toko.</DialogDescription>
          </DialogHeader>
          <form onSubmit={addCategory} className="space-y-4">
            <label htmlFor="category-name" className="text-xs font-semibold text-zinc-300">Nama kategori</label>
            <input id="category-name" autoFocus className={inputClass} value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="Contoh: Viu / WeTV" />
            <div>
              <label htmlFor="category-icon" className="text-xs font-semibold text-zinc-300">Ikon kategori</label>
              <select id="category-icon" className={inputClass} value={categoryIcon} onChange={(event) => setCategoryIcon(event.target.value)}>
                <option value="tv">Streaming</option>
                <option value="film">Film</option>
                <option value="spotify">Musik</option>
                <option value="wetv">WeTV</option>
                <option value="video">Video editor</option>
                <option value="iqiyi">Drama</option>
                <option value="canva">Desain</option>
                <option value="disney">Hiburan</option>
              </select>
            </div>
            <Button className="w-full" type="submit"><FolderPlus size={16} /> Simpan kategori</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={productOpen} onOpenChange={setProductOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProductId ? 'Edit produk' : 'Tambah produk'}</DialogTitle>
            <DialogDescription>
              {editingProductId ? 'Perbarui informasi paket katalog.' : 'Masukkan informasi paket baru untuk katalog.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={addProduct} className="space-y-3">
            <div>
              <label htmlFor="product-category" className="text-xs font-semibold text-zinc-300">Kategori</label>
              <select id="product-category" className={inputClass} value={productCategory} onChange={(event) => setProductCategory(event.target.value)}>
                {categories.map((category) => <option key={category.name} value={category.name}>{category.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="product-title" className="text-xs font-semibold text-zinc-300">Nama produk</label>
              <input id="product-title" className={inputClass} value={productTitle} onChange={(event) => setProductTitle(event.target.value)} placeholder="Contoh: Paket Premium 1 Bulan" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="product-price" className="text-xs font-semibold text-zinc-300">Harga (Rp)</label>
                <input id="product-price" type="number" min="1" className={inputClass} value={productPrice} onChange={(event) => setProductPrice(event.target.value)} placeholder="15000" />
              </div>
              <div>
                <label htmlFor="product-duration" className="text-xs font-semibold text-zinc-300">Durasi / garansi</label>
                <input id="product-duration" className={inputClass} value={productDuration} onChange={(event) => setProductDuration(event.target.value)} placeholder="30 Hari Garansi" />
              </div>
            </div>
            <div>
              <label htmlFor="product-stock" className="text-xs font-semibold text-zinc-300">Stok awal</label>
              <input
                id="product-stock"
                type="number"
                min="0"
                step="1"
                className={inputClass}
                value={productStock}
                onChange={(event) => setProductStock(event.target.value)}
                placeholder="Kosong = tak terbatas"
              />
              <p className="mt-1 text-[10px] text-zinc-500">Masukkan bilangan bulat nol atau lebih. Kosongkan untuk stok tak terbatas.</p>
            </div>
            <Button className="mt-2 w-full" type="submit">
              {editingProductId ? <Pencil size={16} /> : <Plus size={16} />}
              {editingProductId ? 'Simpan perubahan' : 'Simpan produk'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={clearTransactionsOpen}
        onOpenChange={(open) => !clearingTransactions && setClearTransactionsOpen(open)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus riwayat lokal?</DialogTitle>
            <DialogDescription>
              Tindakan ini akan menghapus seluruh {transactions.length} riwayat transaksi dari penyimpanan browser
              ini dan tidak dapat dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="secondary"
              onClick={() => setClearTransactionsOpen(false)}
              disabled={clearingTransactions}
            >
              Batal
            </Button>
            <Button
              variant="danger"
              onClick={clearAllTransactions}
              disabled={clearingTransactions}
            >
              <Trash2 size={15} />
              {clearingTransactions ? 'Menghapus...' : 'Ya, Hapus Riwayat Lokal'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(checkoutProduct)} onOpenChange={(open) => !open && setCheckoutProduct(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Pembayaran QRIS</DialogTitle>
            <DialogDescription>
              {checkoutProduct ? `${checkoutProduct.title} · ${formatPrice(invoice?.amount ?? checkoutProduct.price)}` : 'Selesaikan pesanan Anda.'}
            </DialogDescription>
          </DialogHeader>
          {checkoutProduct && !qrisOpen && (
            <p role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-3 text-xs leading-relaxed text-amber-100">
              <Clock3 size={15} className="mt-0.5 shrink-0 text-amber-300" aria-hidden="true" />
              {STORE_CLOSED_MESSAGE}
            </p>
          )}
          {checkoutProduct && checkoutStep === 'form' && (
            <form onSubmit={processToQRIS} className="space-y-4">
              <div className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-500/10">{iconFor(checkoutProduct.icon, 20)}</span>
                <div>
                  <p className="text-sm font-semibold text-white">{checkoutProduct.title}</p>
                  <p className="mt-1 text-xs text-zinc-500">{checkoutProduct.duration}</p>
                </div>
              </div>
              {checkoutGuide && (
                <section
                  aria-labelledby="checkout-guide-title"
                  className="rounded-2xl border border-sky-500/20 bg-sky-500/[0.06] p-4"
                >
                  <h3 id="checkout-guide-title" className="flex items-center gap-2 text-xs font-bold text-sky-200">
                    <BookOpen size={15} className="shrink-0" aria-hidden="true" />
                    Panduan pembelian
                  </h3>
                  <p className="mt-2 whitespace-pre-line break-words text-xs leading-relaxed text-sky-50">
                    {checkoutGuide}
                  </p>
                </section>
              )}
              <div>
                <label htmlFor="customer-name" className="text-xs font-semibold text-zinc-300">Nama lengkap *</label>
                <input id="customer-name" autoFocus required className={inputClass} value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Nama Anda" />
              </div>
              <div>
                <label htmlFor="customer-wa" className="text-xs font-semibold text-zinc-300">Nomor WhatsApp aktif *</label>
                <input id="customer-wa" type="tel" required className={inputClass} value={customerWA} onChange={(event) => setCustomerWA(event.target.value)} placeholder="Contoh: 08123456789" />
              </div>
              {paymentStatusError && (
                <p role="alert" className="rounded-xl border border-red-500/20 bg-red-500/[0.07] p-3 text-xs leading-relaxed text-red-200">
                  {paymentStatusError}
                </p>
              )}
              <Button className="w-full" type="submit" disabled={paymentCreating || !qrisOpen}>
                {!qrisOpen ? 'Toko sedang tutup' : paymentCreating ? 'Menyiapkan QRIS…' : 'Lanjut bayar via QRIS'}
                <ArrowRight size={16} />
              </Button>
            </form>
          )}
          {checkoutProduct && checkoutStep === 'qris' && invoice && (
            <div className="space-y-4 text-center">
              {invoice.status === 'pending' ? (
                <>
                  <div className="rounded-xl border border-red-500/20 bg-red-500/[0.07] p-3 text-xs leading-5 text-red-100">
                    Scan QRIS dari Xendit menggunakan aplikasi pembayaran yang mendukung QRIS. Nominal dikunci di server sesuai harga katalog.
                  </div>
                  <div className="mx-auto w-fit max-w-full rounded-3xl border-4 border-zinc-200 bg-white p-4 text-zinc-900 shadow-xl">
                    <div className="mb-3 flex items-center justify-center gap-1 text-xs font-black tracking-wider text-red-600"><QrCode size={15} /> QRIS NATIONAL</div>
                    <Suspense fallback={<div className="mx-auto h-[208px] w-[208px] animate-pulse rounded-lg bg-zinc-200" />}>
                      <LazyQrCode
                        id="dynamic-qris-code"
                        value={dynamicQrisPayload}
                        size={208}
                        level="M"
                        marginSize={2}
                        bgColor="#ffffff"
                        fgColor="#09090b"
                        title={`QRIS dinamis sebesar ${formatPrice(invoice.amount)}`}
                      />
                    </Suspense>
                    <p className="mt-3 text-[10px] font-semibold text-zinc-500">2AKINOSTORE DIGITAL</p>
                    <p className="mt-0.5 text-lg font-black">{formatPrice(invoice.amount)}</p>
                    <p className="font-mono text-[10px] text-zinc-400">{invoice.code}</p>
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-4 text-sm leading-relaxed text-amber-100">
                  {invoice.status === 'review'
                    ? 'Pembayaran membutuhkan pemeriksaan admin. Jangan lakukan pembayaran ulang sebelum mendapat arahan.'
                    : `Status pembayaran: ${paymentStatusLabel(invoice.status)}. Jangan gunakan QRIS ini lagi.`}
                </div>
              )}
              <div className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.025] px-4 py-3 text-left">
                <span className="text-xs text-zinc-500">Nomor invoice</span>
                <span className="font-mono text-xs font-bold text-amber-300">{invoice.code}</span>
              </div>
              <p className={`text-xs font-semibold ${invoice.status === 'review' ? 'text-amber-300' : 'text-zinc-300'}`}>
                Status: {paymentStatusLabel(invoice.status)}
              </p>
              {paymentStatusError && (
                <p role="alert" className="rounded-xl border border-red-500/20 bg-red-500/[0.07] p-3 text-xs leading-relaxed text-red-200">
                  {paymentStatusError}
                </p>
              )}
              {invoice.status === 'pending' && (
                <Button variant="success" className="w-full" onClick={confirmPayment} disabled={paymentChecking}>
                  <CheckCircle2 size={16} /> {paymentChecking ? 'Memeriksa…' : 'Perbarui status pembayaran'}
                </Button>
              )}
              {invoice.status !== 'paid' && invoice.status !== 'pending' && (
                <Button
                  as="a"
                  variant="secondary"
                  className="w-full"
                  href={whatsappUrl(activeWhatsApp, `Halo Admin, mohon bantuan untuk Invoice ${invoice.code} (${invoice.productTitle}) dengan status ${paymentStatusLabel(invoice.status)}.`)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Headphones size={16} /> Hubungi admin
                </Button>
              )}
              <p className="text-[10px] leading-relaxed text-zinc-500">Status berubah otomatis setelah Xendit mengonfirmasi pembayaran melalui webhook.</p>
            </div>
          )}
          {checkoutProduct && checkoutStep === 'success' && invoice && (
            <div className="space-y-5">
              <div className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-300"><CheckCircle2 size={28} /></div>
                <h3 className="mt-4 text-lg font-bold text-white">Pembayaran terverifikasi</h3>
                <p className="mt-1 text-xs text-zinc-400">Invoice <span className="font-mono font-bold text-amber-300">{invoice.code}</span></p>
              </div>
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4 text-xs leading-relaxed text-zinc-300">
                Xendit telah mengonfirmasi pembayaran sebesar {formatPrice(invoice.amount)}. Admin akan memproses pesanan Anda.
              </div>
              <Button variant="secondary" className="w-full" onClick={() => { setCheckoutProduct(null); setActiveTab('store'); }}>
                Kembali ke toko
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {notice && (
        <div
          role="status"
          className="toast-in fixed bottom-20 left-1/2 z-[60] flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 text-xs font-medium text-zinc-100 shadow-2xl sm:bottom-5"
        >
          <CheckCircle2 size={15} className="shrink-0 text-emerald-400" /> {notice}
        </div>
      )}
    </div>
  );
}

export default App;
