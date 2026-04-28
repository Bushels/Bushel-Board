// Shared mock data for both directions

const GRAINS_CA = [
  { grain: "Canola", score: 42, prior: 28, conf: "high", price: "$648/t", bullCount: 4, bearCount: 1 },
  { grain: "Spring Wheat", score: 18, prior: 22, conf: "high", price: "$311/t", bullCount: 3, bearCount: 2 },
  { grain: "Barley", score: -12, prior: -4, conf: "medium", price: "$258/t", bullCount: 1, bearCount: 3 },
  { grain: "Oats", score: 8, prior: -2, conf: "medium", price: "$278/t", bullCount: 2, bearCount: 2 },
  { grain: "Peas (Yellow)", score: 24, prior: 30, conf: "medium", price: "$390/t", bullCount: 3, bearCount: 1 },
  { grain: "Flax", score: -28, prior: -18, conf: "low", price: "$540/t", bullCount: 1, bearCount: 4 },
];

const GRAINS_US = [
  { grain: "Corn", score: 36, prior: 18, conf: "high", price: "$4.62 / bu", bullCount: 4, bearCount: 1 },
  { grain: "Soybeans", score: -22, prior: -8, conf: "high", price: "$10.24 / bu", bullCount: 1, bearCount: 4 },
  { grain: "HRW Wheat", score: 14, prior: 6, conf: "medium", price: "$5.38 / bu", bullCount: 3, bearCount: 2 },
  { grain: "SRW Wheat", score: 4, prior: 12, conf: "medium", price: "$5.12 / bu", bullCount: 2, bearCount: 2 },
];

// Weekly trajectory data — Friday reset → Mon→Thu drift, point-per-day
// Each grain has 2 lines: CA + US (when applicable). Score range -100..100
const TRAJECTORIES = {
  Canola:    { ca: [28, 30, 33, 39, 42], us: null },
  Corn:      { ca: null, us: [18, 22, 28, 31, 36] },
  Soybeans:  { ca: null, us: [-8, -12, -18, -20, -22] },
  "Spring Wheat": { ca: [22, 21, 19, 18, 18], us: [6, 8, 10, 12, 14] },
};
const DAYS = ["Fri", "Mon", "Tue", "Wed", "Thu"];

// Bull / bear thesis bullets for the hero card
const HERO_THESIS = {
  grain: "Canola",
  score: 42,
  prior: 28,
  delta: 14,
  conf: "high",
  region: "CA",
  summary:
    "Canola firmed sharply this week. Crush margins widened on stronger oil basis while Vancouver terminal stocks drew down on Asian demand. Loonie weakness adds tailwind.",
  bull: [
    { fact: "Crush margins +$48/t WoW", reasoning: "Domestic oil basis hit 14-month high; Cargill Clavet running 102%." },
    { fact: "Vancouver stocks drew 84kt", reasoning: "Sustained Chinese pull through GE-2; vessel queue 9 deep." },
    { fact: "CAD weakened 1.8% vs USD", reasoning: "Effective FOB price up ~$11/t for offshore buyers." },
    { fact: "Managed money net long +6,200", reasoning: "Funds adding length 4 weeks running per CFTC COT." },
  ],
  bear: [
    { fact: "Producer deliveries lagging -12% YoY", reasoning: "Farmers holding for $700/t; supply could flush if price prints there." },
  ],
};

// Seeding progress — % planted by state/province
const SEEDING_US = [
  { code: "IA", name: "Iowa", pct: 62, prior: 41, fiveYr: 48 },
  { code: "IL", name: "Illinois", pct: 58, prior: 36, fiveYr: 45 },
  { code: "NE", name: "Nebraska", pct: 51, prior: 30, fiveYr: 42 },
  { code: "MN", name: "Minnesota", pct: 38, prior: 21, fiveYr: 35 },
  { code: "IN", name: "Indiana", pct: 44, prior: 24, fiveYr: 38 },
  { code: "OH", name: "Ohio", pct: 22, prior: 11, fiveYr: 28 },
  { code: "MO", name: "Missouri", pct: 49, prior: 32, fiveYr: 41 },
  { code: "SD", name: "South Dakota", pct: 33, prior: 18, fiveYr: 30 },
  { code: "ND", name: "North Dakota", pct: 14, prior: 6, fiveYr: 19 },
  { code: "KS", name: "Kansas", pct: 56, prior: 38, fiveYr: 47 },
  { code: "WI", name: "Wisconsin", pct: 28, prior: 14, fiveYr: 24 },
  { code: "MI", name: "Michigan", pct: 19, prior: 8, fiveYr: 21 },
];
const SEEDING_CA = [
  { code: "AB", name: "Alberta", pct: 8, prior: 2, fiveYr: 12 },
  { code: "SK", name: "Saskatchewan", pct: 4, prior: 1, fiveYr: 7 },
  { code: "MB", name: "Manitoba", pct: 11, prior: 3, fiveYr: 14 },
];

// Kalshi predictive markets — corn & soybeans
const KALSHI = [
  {
    crop: "CORN",
    title: "Will Dec corn close above $4.75 this week?",
    yesPct: 64,
    noPct: 36,
    volume: "$284k",
    move: "+8",
    expires: "Fri, May 2",
  },
  {
    crop: "CORN",
    title: "USDA May WASDE: corn ending stocks below 2.0 bn bu?",
    yesPct: 41,
    noPct: 59,
    volume: "$612k",
    move: "-3",
    expires: "May 9",
  },
  {
    crop: "SOY",
    title: "Will May soybeans close above $10.50 this week?",
    yesPct: 28,
    noPct: 72,
    volume: "$198k",
    move: "-12",
    expires: "Fri, May 2",
  },
  {
    crop: "SOY",
    title: "Soybean planting >55% by May 12?",
    yesPct: 71,
    noPct: 29,
    volume: "$94k",
    move: "+5",
    expires: "May 12",
  },
];

// Spot price strip
const SPOT = [
  { sym: "Corn",     px: "4.62",  unit: "/bu", chg: "+0.08", pct: "+1.76%", up: true },
  { sym: "Soybeans", px: "10.24", unit: "/bu", chg: "-0.14", pct: "-1.35%", up: false },
  { sym: "Wheat",    px: "5.38",  unit: "/bu", chg: "+0.04", pct: "+0.75%", up: true },
];

window.BB_DATA = { GRAINS_CA, GRAINS_US, TRAJECTORIES, DAYS, HERO_THESIS, SEEDING_US, SEEDING_CA, KALSHI, SPOT };
