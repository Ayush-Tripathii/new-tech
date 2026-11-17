/**
 * Site content. PROOF POINTS, CLIENTS, AWARDS AND TESTIMONIALS ARE PLACEHOLDERS
 * — replace before launch. Everything is typed so a CMS can drop in later.
 */

export const brand = {
  name: 'GBGTech',
  tagline: 'Engineering the Future.',
  promise: 'We engineer unforgettable digital experiences.',
  founded: 2020,
  city: 'Bhopal',
  country: 'India',
  timezone: 'Asia/Kolkata',
  email: 'hello@gbgtech.com',
  phone: '+91 00000 00000',
  coords: '23.2599° N, 77.4126° E',
  verbs: ['Design', 'Engineer', 'Scale'],
  socials: [
    { label: 'LinkedIn', href: 'https://www.linkedin.com/' },
    { label: 'Instagram', href: 'https://www.instagram.com/' },
    { label: 'Behance', href: 'https://www.behance.net/' },
    { label: 'GitHub', href: 'https://github.com/' },
  ],
}

export const nav = [
  { label: 'Work', href: '/work' },
  { label: 'Services', href: '/services' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/#contact' },
]

export interface Service {
  index: string
  title: string
  summary: string
  scope: string[]
  stack: string[]
}

/** The eight requested services, consolidated into six disciplines. */
export const services: Service[] = [
  {
    index: '01',
    title: 'Product & Web Design',
    summary: 'Interfaces drawn to tolerance — systems, not screens. Research, UX architecture and visual design that survives contact with engineering.',
    scope: ['Website design', 'UX architecture', 'Design systems', 'Prototyping'],
    stack: ['Figma', 'Framer', 'Rive', 'Spline'],
  },
  {
    index: '02',
    title: 'Web Engineering',
    summary: 'High-performance websites and platforms with motion as architecture. Static where possible, edge-rendered where not.',
    scope: ['Website development', 'Headless CMS', 'WebGL', 'Performance'],
    stack: ['Next.js', 'TypeScript', 'GSAP', 'Three.js'],
  },
  {
    index: '03',
    title: 'Software Engineering',
    summary: 'Platforms, internal tools and APIs built to be maintained for a decade. Typed end-to-end, observable from day one.',
    scope: ['Custom software', 'APIs & integrations', 'Cloud architecture', 'DevOps'],
    stack: ['Node', 'Go', 'PostgreSQL', 'AWS'],
  },
  {
    index: '04',
    title: 'Application Development',
    summary: 'Native-grade iOS, Android and cross-platform apps. Sixty frames per second is a requirement, not a stretch goal.',
    scope: ['iOS & Android', 'Cross-platform', 'Offline-first', 'App Store ops'],
    stack: ['Swift', 'Kotlin', 'React Native', 'Flutter'],
  },
  {
    index: '05',
    title: 'Brand, Motion & Film',
    summary: 'Identity systems, graphic design and edited film — the same precision applied to pixels that move.',
    scope: ['Graphic design', 'Video editing', 'Motion graphics', 'Brand identity'],
    stack: ['After Effects', 'Premiere', 'DaVinci', 'Cinema 4D'],
  },
  {
    index: '06',
    title: 'Growth Engineering',
    summary: 'Digital and performance marketing run like an engineering discipline: instrumented, tested, compounding.',
    scope: ['Digital marketing', 'Performance marketing', 'SEO', 'Analytics'],
    stack: ['GA4', 'Meta Ads', 'Google Ads', 'Looker'],
  },
]

export interface Project {
  slug: string
  name: string
  client: string
  year: number
  discipline: 'Web' | 'Product' | 'App' | 'Brand' | 'Platform'
  color: string
  /** secondary tone for generated art */
  tone: string
  summary: string
  outcome: string
  metrics: { label: string; value: string }[]
  quote?: { text: string; by: string }
}

export const projects: Project[] = [
  {
    slug: 'meridian-ledger',
    name: 'Meridian Ledger',
    client: 'Meridian Capital',
    year: 2025,
    discipline: 'Platform',
    color: '#2E4BDB',
    tone: '#C9D3FF',
    summary: 'A treasury platform reconciling 1.2M daily transactions across 14 banking rails, with a real-time exposure view traders actually open.',
    outcome: 'Settlement exceptions down 71% in the first quarter.',
    metrics: [
      { label: 'Daily txns', value: '1.2M' },
      { label: 'Exceptions', value: '−71%' },
      { label: 'P95 latency', value: '84ms' },
    ],
    quote: { text: 'It is the first internal tool our desk asked to keep open on a second monitor.', by: 'Head of Treasury Ops' },
  },
  {
    slug: 'kaveri-health',
    name: 'Kaveri Health',
    client: 'Kaveri Clinics',
    year: 2025,
    discipline: 'App',
    color: '#0F8A6A',
    tone: '#BFE8DB',
    summary: 'Patient app and clinician console for a 40-clinic network — appointments, records and tele-consults in one calm surface.',
    outcome: 'No-shows fell 38%; 4.8★ across both stores.',
    metrics: [
      { label: 'Clinics', value: '40' },
      { label: 'No-shows', value: '−38%' },
      { label: 'Rating', value: '4.8★' },
    ],
  },
  {
    slug: 'atlas-forge',
    name: 'Atlas Forge',
    client: 'Atlas Industrial',
    year: 2024,
    discipline: 'Web',
    color: '#C2410C',
    tone: '#FAD3BE',
    summary: 'A WebGL product configurator for heavy machinery: 3,000 part combinations rendered in-browser at studio quality.',
    outcome: 'Qualified leads up 2.4× year on year.',
    metrics: [
      { label: 'Configs', value: '3,000' },
      { label: 'Leads', value: '2.4×' },
      { label: 'LCP', value: '1.6s' },
    ],
    quote: { text: 'Buyers configure the machine before they call us now. The sales conversation starts at the spec sheet.', by: 'VP Sales, Atlas Industrial' },
  },
  {
    slug: 'nila-studio',
    name: 'Nila',
    client: 'Nila Textiles',
    year: 2024,
    discipline: 'Brand',
    color: '#1E3A8A',
    tone: '#D7DEF2',
    summary: 'Identity, packaging and a campaign film for an indigo-dye heritage label moving into global retail.',
    outcome: 'Launched in 6 markets; film at 3.1M organic views.',
    metrics: [
      { label: 'Markets', value: '06' },
      { label: 'Views', value: '3.1M' },
      { label: 'Assets', value: '240' },
    ],
  },
  {
    slug: 'orbital-ops',
    name: 'Orbital Ops',
    client: 'Orbital Logistics',
    year: 2024,
    discipline: 'Platform',
    color: '#4338CA',
    tone: '#DCDAF7',
    summary: 'Fleet orchestration for 2,800 vehicles: routing, live telemetry and a dispatcher console designed for 12-hour shifts.',
    outcome: 'Fuel cost per drop down 17%.',
    metrics: [
      { label: 'Vehicles', value: '2,800' },
      { label: 'Fuel / drop', value: '−17%' },
      { label: 'Uptime', value: '99.98%' },
    ],
  },
  {
    slug: 'saffron-pay',
    name: 'Saffron Pay',
    client: 'Saffron Fintech',
    year: 2023,
    discipline: 'App',
    color: '#D97706',
    tone: '#FBE3BF',
    summary: 'A UPI-first payments app for small merchants — onboarding in under four minutes, settlement on the same day.',
    outcome: '210K merchants in the first year.',
    metrics: [
      { label: 'Merchants', value: '210K' },
      { label: 'Onboarding', value: '3m 40s' },
      { label: 'Crash-free', value: '99.9%' },
    ],
  },
  {
    slug: 'lumen-labs',
    name: 'Lumen Labs',
    client: 'Lumen Biotech',
    year: 2023,
    discipline: 'Web',
    color: '#0E7490',
    tone: '#C4E6EE',
    summary: 'Investor-grade site for a biotech platform, with a molecular viewer that explains the science in thirty seconds.',
    outcome: 'Series B data room traffic tripled.',
    metrics: [
      { label: 'Time on site', value: '4m 12s' },
      { label: 'Traffic', value: '3×' },
      { label: 'Lighthouse', value: '98' },
    ],
  },
  {
    slug: 'vertex-growth',
    name: 'Vertex',
    client: 'Vertex D2C',
    year: 2023,
    discipline: 'Product',
    color: '#BE185D',
    tone: '#F6CCDD',
    summary: 'Storefront rebuild plus a performance-marketing engine: creative testing at 60 variants a week, fully instrumented.',
    outcome: 'ROAS 1.8 → 4.2 in two quarters.',
    metrics: [
      { label: 'ROAS', value: '4.2' },
      { label: 'Variants / wk', value: '60' },
      { label: 'CAC', value: '−44%' },
    ],
  },
  {
    slug: 'monsoon-film',
    name: 'Monsoon',
    client: 'Monsoon Records',
    year: 2022,
    discipline: 'Brand',
    color: '#334155',
    tone: '#D5DBE3',
    summary: 'Visual identity and an edited documentary series for an independent label’s tenth anniversary.',
    outcome: 'Series shortlisted at two festivals.',
    metrics: [
      { label: 'Episodes', value: '08' },
      { label: 'Runtime', value: '96m' },
      { label: 'Festivals', value: '02' },
    ],
  },
  {
    slug: 'gridline-cloud',
    name: 'Gridline',
    client: 'Gridline Energy',
    year: 2022,
    discipline: 'Platform',
    color: '#15803D',
    tone: '#C9E9D2',
    summary: 'A data platform ingesting smart-meter readings from 900K homes, forecasting load per substation every 15 minutes.',
    outcome: 'Forecast error reduced to 3.2% MAPE.',
    metrics: [
      { label: 'Homes', value: '900K' },
      { label: 'MAPE', value: '3.2%' },
      { label: 'Interval', value: '15m' },
    ],
  },
]

export const facts = [
  { value: '140+', label: 'Products shipped', hint: 'since 2020' },
  { value: '01.5M+', label: 'Monthly end users', hint: 'across client platforms' },
  { value: '018', label: 'Countries served', hint: 'from Bhopal' },
  { value: '097%', label: 'Client retention', hint: 'year over year' },
]

/** PLACEHOLDER recognitions — replace with real ones or remove. */
export const awards = ['Awwwards', 'CSS Design Awards', 'The FWA', 'Clutch Top 100', 'GoodFirms', 'Webby Honoree']

export const testimonials = [
  {
    name: 'Ananya Rao',
    role: 'CTO, Meridian Capital',
    quote: 'GBGTech treat a deadline like a tolerance — something you engineer to, not something you hope for. The platform shipped on the day it was promised.',
  },
  {
    name: 'Daniel Okafor',
    role: 'Founder, Saffron Fintech',
    quote: 'They argued with us about milliseconds. We were annoyed for a week and grateful for a year. Our merchants feel the speed.',
  },
  {
    name: 'Meera Kulkarni',
    role: 'CMO, Vertex D2C',
    quote: 'The first agency that brought an engineering mindset to marketing. Every rupee instrumented, every creative tested, every claim provable.',
  },
  {
    name: 'Lars Henningsen',
    role: 'Head of Digital, Atlas Industrial',
    quote: 'The configurator looks photographed. Customers ask us which studio shot the machines. Nobody shot them — they were rendered in the browser.',
  },
]

export const process = [
  { index: '01', title: 'Calibrate', body: 'Two-week discovery. We measure the problem before we touch it: users, data, constraints, the definition of done.' },
  { index: '02', title: 'Machine', body: 'Design and engineering in one loop, shipping weekly to a staging environment you can open on your phone.' },
  { index: '03', title: 'Seat', body: 'Launch, instrument, tune. We stay until the numbers hold — then we hand over a system your team can own.' },
]

export const team = [
  { name: 'Gaurav B.', role: 'Founder · Engineering', init: 'GB' },
  { name: 'Aditi S.', role: 'Design Director', init: 'AS' },
  { name: 'Rohan M.', role: 'Head of Platform', init: 'RM' },
  { name: 'Ishita K.', role: 'Motion & Film', init: 'IK' },
  { name: 'Vikram T.', role: 'Growth Lead', init: 'VT' },
  { name: 'Neha P.', role: 'Mobile Lead', init: 'NP' },
]

export const stack = [
  { group: 'Frontend', items: ['Next.js', 'React', 'TypeScript', 'GSAP', 'Three.js / WebGL', 'Tailwind'] },
  { group: 'Mobile', items: ['Swift / SwiftUI', 'Kotlin / Compose', 'React Native', 'Flutter'] },
  { group: 'Backend', items: ['Node.js', 'Go', 'Python', 'PostgreSQL', 'Redis', 'GraphQL'] },
  { group: 'Cloud', items: ['AWS', 'GCP', 'Vercel', 'Docker', 'Kubernetes', 'Terraform'] },
  { group: 'Creative', items: ['Figma', 'After Effects', 'Premiere', 'DaVinci Resolve', 'Cinema 4D', 'Blender'] },
  { group: 'Growth', items: ['GA4', 'Meta Ads', 'Google Ads', 'HubSpot', 'Looker Studio', 'Hotjar'] },
]
