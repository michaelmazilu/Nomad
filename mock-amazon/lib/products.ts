// Hardcoded catalog. There is NO catalog backend, DB, or search API — this static
// array is the entire product source of truth (POC constraint).

export interface Product {
  id: string;
  title: string;
  priceCents: number;
  // NOTE: this mock has no real product photography. `image` holds an emoji glyph
  // and `accent` a hex color; <ProductImage> renders a colored placeholder tile
  // from them. (Keeps the app fully self-contained with zero external assets.)
  image: string;
  accent: string;
  rating: number; // 0–5, static
  ratingCount: number;
  bullets: string[];
  inStock: boolean;
  brand: string;
  category: string;
}

export const PRODUCTS: Product[] = [
  {
    id: "echo-orb",
    title: "Jamazon Echo Orb — Smart Speaker with Nomad Voice Assistant",
    priceCents: 4999,
    image: "🔊",
    accent: "#2b6cb0",
    rating: 4.5,
    ratingCount: 18234,
    inStock: true,
    brand: "Jamazon",
    category: "Smart Home",
    bullets: [
      "Room-filling sound with crisp vocals and deep bass",
      "Hands-free voice control for music, timers, and smart home",
      "Privacy shutter and a single press to mute microphones",
      "Pairs in seconds over Wi-Fi — no hub required",
    ],
  },
  {
    id: "kindle-slate",
    title: "Jamazon Slate Paper — 6.8\" Glare-Free E-Reader (16 GB)",
    priceCents: 13999,
    image: "📖",
    accent: "#4a5568",
    rating: 4.7,
    ratingCount: 90412,
    inStock: true,
    brand: "Jamazon",
    category: "Reading",
    bullets: [
      "Glare-free 300 ppi display reads like real paper",
      "Adjustable warm light for day-to-night reading",
      "Weeks of battery life on a single charge",
      "Waterproof (IPX8) — read at the beach or in the bath",
    ],
  },
  {
    id: "aura-buds",
    title: "Aura Buds Pro — Active Noise Cancelling Wireless Earbuds",
    priceCents: 8900,
    image: "🎧",
    accent: "#6b46c1",
    rating: 4.4,
    ratingCount: 53120,
    inStock: true,
    brand: "Aura",
    category: "Audio",
    bullets: [
      "Adaptive active noise cancellation with transparency mode",
      "Up to 30 hours total playback with the charging case",
      "Sweat- and water-resistant for workouts (IPX4)",
      "Instant pairing and seamless device switching",
    ],
  },
  {
    id: "brew-master",
    title: "BrewMaster 12-Cup Programmable Coffee Maker, Stainless Steel",
    priceCents: 5499,
    image: "☕",
    accent: "#9c4221",
    rating: 4.3,
    ratingCount: 27765,
    inStock: true,
    brand: "BrewMaster",
    category: "Kitchen",
    bullets: [
      "Program your brew up to 24 hours in advance",
      "Keep-warm carafe with auto shut-off",
      "Reusable gold-tone filter — no paper needed",
      "Pause-and-pour to grab a cup mid-brew",
    ],
  },
  {
    id: "trail-pack",
    title: "Summit Trail 35L Hiking Backpack — Lightweight & Water-Resistant",
    priceCents: 7250,
    image: "🎒",
    accent: "#2f855a",
    rating: 4.6,
    ratingCount: 12098,
    inStock: true,
    brand: "Summit",
    category: "Outdoors",
    bullets: [
      "Breathable padded back panel and adjustable straps",
      "Dedicated hydration sleeve and laptop pocket",
      "Water-resistant ripstop fabric with rain cover",
      "Multiple compartments keep gear organized",
    ],
  },
  {
    id: "lumen-lamp",
    title: "Lumen Desk Lamp — LED with Wireless Charging Base & USB-C",
    priceCents: 3899,
    image: "💡",
    accent: "#b7791f",
    rating: 4.2,
    ratingCount: 8421,
    inStock: true,
    brand: "Lumen",
    category: "Office",
    bullets: [
      "Five color temperatures and stepless dimming",
      "Built-in 10W wireless charging pad for your phone",
      "USB-C port to top up earbuds or a tablet",
      "Memory function recalls your last brightness setting",
    ],
  },
  {
    id: "pixel-cam",
    title: "PixelView 4K Action Camera with Waterproof Case & Mounts",
    priceCents: 11900,
    image: "📷",
    accent: "#c53030",
    rating: 4.1,
    ratingCount: 6310,
    inStock: true,
    brand: "PixelView",
    category: "Electronics",
    bullets: [
      "Stabilized 4K60 video and 20MP stills",
      "Waterproof to 30m with the included dive case",
      "Wi-Fi preview and one-tap sharing to your phone",
      "Bundle includes mounts, straps, and two batteries",
    ],
  },
  {
    id: "cozy-throw",
    title: "CloudSoft Fleece Throw Blanket, 50\" x 60\" — Charcoal",
    priceCents: 2499,
    image: "🛋️",
    accent: "#718096",
    rating: 4.8,
    ratingCount: 142559,
    inStock: true,
    brand: "CloudSoft",
    category: "Home",
    bullets: [
      "Ultra-soft brushed microfiber, warm but breathable",
      "Machine washable and fade-resistant",
      "Generous 50\" x 60\" size for the couch or bed",
      "Available in a dozen colors to match any room",
    ],
  },
  {
    id: "smart-plug",
    title: "Jamazon Smart Plug (4-Pack) — Works with Nomad Voice Assistant",
    priceCents: 2799,
    image: "🔌",
    accent: "#319795",
    rating: 4.5,
    ratingCount: 64200,
    inStock: true,
    brand: "Jamazon",
    category: "Smart Home",
    bullets: [
      "Control lamps and appliances by voice or app",
      "Set schedules and timers from anywhere",
      "Compact design won't block the second outlet",
      "No hub required — connects directly to Wi-Fi",
    ],
  },
  {
    id: "mech-keys",
    title: "ClickType Mechanical Keyboard — Hot-Swappable, RGB Backlit",
    priceCents: 8499,
    image: "⌨️",
    accent: "#2d3748",
    rating: 4.6,
    ratingCount: 21770,
    inStock: false,
    brand: "ClickType",
    category: "Office",
    bullets: [
      "Hot-swappable switches — customize without soldering",
      "Per-key RGB with onboard memory for your profiles",
      "Doubleshot PBT keycaps that won't shine over time",
      "USB-C detachable cable and wireless 2.4 GHz mode",
    ],
  },
];

export function getProduct(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}
