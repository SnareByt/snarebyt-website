/**
 * SnareByt seed — the real catalogue.
 *
 *  Rules applied here:
 *  - Every price is whole BDT. USD is derived from the usdRate setting.
 *  - Every licence tier and service package carries Bangla text; both
 *    fields are required by the schema so this cannot regress.
 *  - Only Spotify IDs verified against Spotify's oEmbed endpoint are
 *    included. A wrong ID means someone else's song playing on the site.
 *  - Releases default to live only where the record is confirmed public.
 *
 *  Run:  npm run db:seed
 */
import { PrismaClient, AssetKind } from '@prisma/client';
import argon2 from 'argon2';

const db = new PrismaClient();

const CREDIT = '“Prod. SnareByt”';

/* ---------------- Licence tiers (bilingual) ---------------- */
const LICENCES = [
  {
    code: 'mp3', name: 'MP3 Licence', nameBn: 'এমপিথ্রি লাইসেন্স', multiplier: 1, sortOrder: 1,
    filesLabel: 'Tagless MP3 320kbps', filesLabelBn: 'ট্যাগমুক্ত MP3 ৩২০kbps',
    includedAssets: [AssetKind.MP3_UNTAGGED],
    streamLimit: 50_000, saleLimit: 2_500, videoLimit: 1, radioStations: 0,
    performanceRights: 'Non-profit performances only', isExclusive: false, transfersOwnership: false,
    termsMarkdown: [
      'Non-exclusive — the beat stays on sale for others',
      'Up to 50,000 streams total', 'Up to 2,500 paid sales', '1 music video',
      'Non-profit performances only', 'No radio broadcast',
      'Monetisation on YouTube allowed', `Credit required: ${CREDIT}`,
      'SnareByt keeps full ownership',
    ].join('\n'),
    termsMarkdownBn: [
      'নন-এক্সক্লুসিভ — বিটটি অন্যদের জন্যও বিক্রিতে থাকবে',
      'সর্বমোট ৫০,০০০ স্ট্রিম পর্যন্ত', 'সর্বোচ্চ ২,৫০০টি পেইড সেল', '১টি মিউজিক ভিডিও',
      'শুধুমাত্র অলাভজনক পারফরম্যান্স', 'রেডিও ব্রডকাস্ট করা যাবে না',
      'ইউটিউব মনিটাইজেশন করা যাবে', `ক্রেডিট দিতে হবে: ${CREDIT}`,
      'বিটের সম্পূর্ণ মালিকানা SnareByt-এর কাছেই থাকবে',
    ].join('\n'),
  },
  {
    code: 'wav', name: 'WAV Licence', nameBn: 'ওয়েভ লাইসেন্স', multiplier: 2.4, sortOrder: 2,
    filesLabel: 'WAV 24-bit + MP3 320kbps', filesLabelBn: 'WAV ২৪-বিট + MP3 ৩২০kbps',
    includedAssets: [AssetKind.WAV, AssetKind.MP3_UNTAGGED],
    streamLimit: 150_000, saleLimit: 5_000, videoLimit: 1, radioStations: 2,
    performanceRights: 'Live performances allowed', isExclusive: false, transfersOwnership: false,
    termsMarkdown: [
      'Non-exclusive — the beat stays on sale for others',
      'Up to 150,000 streams total', 'Up to 5,000 paid sales', '1 music video',
      'Live performances allowed', '2 radio stations', 'Full monetisation allowed',
      `Credit required: ${CREDIT}`, 'SnareByt keeps full ownership',
    ].join('\n'),
    termsMarkdownBn: [
      'নন-এক্সক্লুসিভ — বিটটি অন্যদের জন্যও বিক্রিতে থাকবে',
      'সর্বমোট ১,৫০,০০০ স্ট্রিম পর্যন্ত', 'সর্বোচ্চ ৫,০০০টি পেইড সেল', '১টি মিউজিক ভিডিও',
      'লাইভ পারফরম্যান্স করা যাবে', '২টি রেডিও স্টেশন', 'সম্পূর্ণ মনিটাইজেশন করা যাবে',
      `ক্রেডিট দিতে হবে: ${CREDIT}`, 'মালিকানা SnareByt-এর কাছেই থাকবে',
    ].join('\n'),
  },
  {
    code: 'stems', name: 'Trackout / Stems', nameBn: 'ট্র্যাকআউট / স্টেমস লাইসেন্স', multiplier: 5, sortOrder: 3,
    filesLabel: 'WAV + MP3 + all stems (zip)', filesLabelBn: 'WAV + MP3 + সব স্টেম (zip)',
    includedAssets: [AssetKind.WAV, AssetKind.MP3_UNTAGGED, AssetKind.STEMS_ZIP],
    streamLimit: 500_000, saleLimit: 10_000, videoLimit: 2, radioStations: null,
    performanceRights: 'Unlimited live performances', isExclusive: false, transfersOwnership: false,
    termsMarkdown: [
      'Non-exclusive — the beat stays on sale for others',
      'Up to 500,000 streams total', 'Up to 10,000 paid sales', '2 music videos',
      'Unlimited live performances', 'Unlimited radio', 'Full monetisation allowed',
      `Credit required: ${CREDIT}`, 'SnareByt keeps full ownership',
    ].join('\n'),
    termsMarkdownBn: [
      'নন-এক্সক্লুসিভ — বিটটি অন্যদের জন্যও বিক্রিতে থাকবে',
      'সর্বমোট ৫,০০,০০০ স্ট্রিম পর্যন্ত', 'সর্বোচ্চ ১০,০০০টি পেইড সেল', '২টি মিউজিক ভিডিও',
      'আনলিমিটেড লাইভ পারফরম্যান্স', 'আনলিমিটেড রেডিও', 'সম্পূর্ণ মনিটাইজেশন করা যাবে',
      `ক্রেডিট দিতে হবে: ${CREDIT}`, 'মালিকানা SnareByt-এর কাছেই থাকবে',
    ].join('\n'),
  },
  {
    code: 'unlim', name: 'Unlimited Licence', nameBn: 'আনলিমিটেড লাইসেন্স', multiplier: 9, sortOrder: 4,
    filesLabel: 'WAV + MP3 + stems + session notes', filesLabelBn: 'WAV + MP3 + স্টেমস + সেশন নোট',
    includedAssets: [AssetKind.WAV, AssetKind.MP3_UNTAGGED, AssetKind.STEMS_ZIP, AssetKind.SESSION_NOTES],
    streamLimit: null, saleLimit: null, videoLimit: null, radioStations: null,
    performanceRights: 'Unlimited live performances', isExclusive: false, transfersOwnership: false,
    termsMarkdown: [
      'Non-exclusive — the beat stays on sale for others',
      'Unlimited streams', 'Unlimited paid sales', 'Unlimited music videos',
      'Unlimited live performances', 'Unlimited radio', 'Full monetisation allowed',
      `Credit required: ${CREDIT}`, 'Beat stays in the store; SnareByt keeps ownership',
    ].join('\n'),
    termsMarkdownBn: [
      'নন-এক্সক্লুসিভ — বিটটি অন্যদের জন্যও বিক্রিতে থাকবে',
      'আনলিমিটেড স্ট্রিম', 'আনলিমিটেড পেইড সেল', 'আনলিমিটেড মিউজিক ভিডিও',
      'আনলিমিটেড লাইভ পারফরম্যান্স', 'আনলিমিটেড রেডিও', 'সম্পূর্ণ মনিটাইজেশন করা যাবে',
      `ক্রেডিট দিতে হবে: ${CREDIT}`, 'বিটটি স্টোরে থাকবে; মালিকানা SnareByt-এর',
    ].join('\n'),
  },
  {
    code: 'excl', name: 'Exclusive Rights', nameBn: 'এক্সক্লুসিভ রাইটস', multiplier: 26, sortOrder: 5,
    filesLabel: 'WAV + MP3 + stems + signed exclusive contract',
    filesLabelBn: 'WAV + MP3 + স্টেমস + সাইনকৃত এক্সক্লুসিভ চুক্তি',
    includedAssets: [AssetKind.WAV, AssetKind.MP3_UNTAGGED, AssetKind.STEMS_ZIP, AssetKind.SESSION_NOTES],
    streamLimit: null, saleLimit: null, videoLimit: null, radioStations: null,
    performanceRights: 'Unlimited live performances', isExclusive: true, transfersOwnership: true,
    termsMarkdown: [
      'EXCLUSIVE — the beat is removed from the store and nobody else can ever licence it',
      'Unlimited streams', 'Unlimited paid sales', 'Unlimited music videos',
      'Unlimited live performances', 'Unlimited radio', 'Full monetisation allowed',
      `Credit required: ${CREDIT}`, 'Master ownership transferred per contract',
    ].join('\n'),
    termsMarkdownBn: [
      'এক্সক্লুসিভ — বিটটি স্টোর থেকে সরিয়ে ফেলা হবে, অন্য কেউ আর কখনও এটি লাইসেন্স নিতে পারবে না',
      'আনলিমিটেড স্ট্রিম', 'আনলিমিটেড পেইড সেল', 'আনলিমিটেড মিউজিক ভিডিও',
      'আনলিমিটেড লাইভ পারফরম্যান্স', 'আনলিমিটেড রেডিও', 'সম্পূর্ণ মনিটাইজেশন করা যাবে',
      `ক্রেডিট দিতে হবে: ${CREDIT}`, 'চুক্তি অনুযায়ী মাস্টার মালিকানা হস্তান্তর করা হবে',
    ].join('\n'),
  },
];

/* ---------------- Services (exact prices supplied by Samir) ---------------- */
const SERVICES = [
  {
    slug: 'custom-beat-production', title: 'Custom Beat Production', sortOrder: 1,
    tagline: 'An original record built around your voice',
    audience: 'Artists who want a beat nobody else can lease, written to their reference, register and song structure.',
    included: ['Original production from scratch', 'Arranged to your song structure', 'Sound selection and transitions', 'All stems delivered', 'Exclusive rights included', 'Producer credit agreement'],
    required: ['Reference tracks', 'Vocal sample or scratch take', 'Preferred key and tempo'],
    deliveryDays: '7–14 days', revisions: 'Revisions per package',
    tiers: [
      { name: 'Basic', priceBdt: 10000, recommended: false,
        description: 'A professionally produced original beat with a simpler arrangement and standard delivery.',
        descriptionBn: 'সহজ অ্যারেঞ্জমেন্ট ও স্ট্যান্ডার্ড ডেলিভারিতে পেশাদারভাবে তৈরি একটি অরিজিনাল বিট।' },
      { name: 'Professional', priceBdt: 16000, recommended: true,
        description: 'A more detailed custom production with stronger arrangement, sound selection, transitions and artist-focused direction.',
        descriptionBn: 'আরও বিস্তারিত কাস্টম প্রোডাকশন — শক্তিশালী অ্যারেঞ্জমেন্ট, সাউন্ড সিলেকশন, ট্রানজিশন এবং শিল্পী-কেন্দ্রিক দিকনির্দেশনা।' },
      { name: 'Premium', priceBdt: 30000, recommended: false,
        description: 'High-level custom production with the most detailed creative direction, advanced arrangement and premium sound design.',
        descriptionBn: 'সর্বোচ্চ মানের কাস্টম প্রোডাকশন — বিস্তারিত ক্রিয়েটিভ ডিরেকশন, অ্যাডভান্সড অ্যারেঞ্জমেন্ট ও প্রিমিয়াম সাউন্ড ডিজাইন।' },
    ],
  },
  {
    slug: 'mixing-and-mastering', title: 'Mixing and Mastering', sortOrder: 2,
    tagline: 'Vocal processing included — one service, not two',
    audience: 'Independent artists and labels with recorded sessions that need to compete with major-label releases.',
    included: ['Full stem mixing', 'Vocal processing, tuning and timing', 'Balance, clarity, depth and loudness', 'Streaming-ready master', 'Instrumental and clean versions', 'Stem masters on Premium'],
    required: ['Session at 24-bit WAV', 'All stems from bar 1', 'Reference track', 'Rough mix'],
    deliveryDays: '3–5 days', revisions: 'Revisions per package',
    tiers: [
      { name: 'Basic', priceBdt: 3000, recommended: false,
        description: 'A simple song: one instrumental or beat, lead vocal, and basic vocal layers where applicable.',
        descriptionBn: 'সাধারণ একটি গান — একটি ইনস্ট্রুমেন্টাল বা বিট, লিড ভোকাল এবং প্রয়োজনে সাধারণ ভোকাল লেয়ার।' },
      { name: 'Professional', priceBdt: 6000, recommended: true,
        description: 'Up to 12 stems. Full vocal processing, mixing and mastering with professional balance, clarity, depth and loudness.',
        descriptionBn: 'সর্বোচ্চ ১২টি স্টেম। সম্পূর্ণ ভোকাল প্রসেসিং, মিক্সিং ও মাস্টারিং — পেশাদার ব্যালান্স, ক্লারিটি, ডেপথ ও লাউডনেস।' },
      { name: 'Premium', priceBdt: 15000, recommended: false,
        description: 'Complex sessions. Unlimited stems subject to reasonable project requirements, detailed vocal processing, advanced automation, creative effects, detailed revisions and final polish.',
        descriptionBn: 'জটিল সেশনের জন্য। যুক্তিসঙ্গত প্রয়োজন অনুযায়ী আনলিমিটেড স্টেম, বিস্তারিত ভোকাল প্রসেসিং, অ্যাডভান্সড অটোমেশন, ক্রিয়েটিভ ইফেক্ট, বিস্তারিত রিভিশন ও ফাইনাল পলিশ।' },
    ],
  },
  {
    slug: 'cover-art-design', title: 'Cover Art Design', sortOrder: 3,
    tagline: 'Artwork that survives being 40px wide',
    audience: 'Singles, EPs and albums that need a visual identity as strong as the audio.',
    included: ['3000×3000 print and DSP master', 'Concept directions per package', 'Story and Reel crops on higher tiers', 'Spotify Canvas loop on Premium', 'Source files on request'],
    required: ['Song or rough mix', 'Mood references', 'Title and artist text'],
    deliveryDays: '4–6 days', revisions: 'Revisions per package',
    tiers: [
      { name: 'Basic', priceBdt: 1500, recommended: false,
        description: 'One concept direction, one cover, 3000×3000 master, two revisions.',
        descriptionBn: 'একটি কনসেপ্ট, একটি কভার, ৩০০০×৩০০০ মাস্টার ফাইল, দুইটি রিভিশন।' },
      { name: 'Professional', priceBdt: 3000, recommended: true,
        description: 'Two concept directions, social crops for Story and Reel, three revisions, print-ready formats.',
        descriptionBn: 'দুইটি কনসেপ্ট, স্টোরি ও রিলের জন্য সোশ্যাল ক্রপ, তিনটি রিভিশন, প্রিন্ট-রেডি ফরম্যাট।' },
      { name: 'Premium', priceBdt: 5000, recommended: false,
        description: 'Three concept directions, full promotional set, Spotify Canvas loop, extended revisions and all deliverable formats.',
        descriptionBn: 'তিনটি কনসেপ্ট, সম্পূর্ণ প্রোমোশনাল সেট, Spotify Canvas লুপ, বাড়তি রিভিশন এবং সব ডেলিভারেবল ফরম্যাট।' },
    ],
  },
  {
    slug: 'video-editing', title: 'Video Editing', sortOrder: 4,
    tagline: 'Cinematic grade, rhythmic cutting',
    audience: 'Artists with footage that needs to feel like a label-funded video.',
    included: ['Assembly and rhythmic edit', 'Colour work and grading', 'Transitions and pacing', 'Text and motion graphics on higher tiers', 'Final delivery master'],
    required: ['All raw footage', 'Final mastered audio', 'Reference videos'],
    deliveryDays: '4–12 days', revisions: 'Revisions per package',
    tiers: [
      { name: 'Basic', priceBdt: 3000, recommended: false,
        description: 'A video up to roughly one minute, a reel, or a simple single-location performance edit.',
        descriptionBn: 'প্রায় এক মিনিট পর্যন্ত ভিডিও, একটি রিল, অথবা এক লোকেশনের সাধারণ পারফরম্যান্স এডিট।' },
      { name: 'Professional', priceBdt: 8000, recommended: true,
        description: 'Up to roughly two minutes with more detailed editing, transitions, pacing, colour work and visual treatment.',
        descriptionBn: 'প্রায় দুই মিনিট পর্যন্ত ভিডিও — আরও বিস্তারিত এডিটিং, ট্রানজিশন, পেসিং, কালার ওয়ার্ক ও ভিজ্যুয়াল ট্রিটমেন্ট।' },
      { name: 'Premium', priceBdt: 20000, recommended: false,
        description: 'A full premium music-video edit: advanced pacing, multiple scenes where applicable, detailed effects, colour grading, creative treatment and professional final delivery.',
        descriptionBn: 'সম্পূর্ণ প্রিমিয়াম মিউজিক ভিডিও এডিট — অ্যাডভান্সড পেসিং, প্রয়োজনে একাধিক সিন, বিস্তারিত ইফেক্ট, কালার গ্রেডিং, ক্রিয়েটিভ ট্রিটমেন্ট ও পেশাদার ফাইনাল ডেলিভারি।' },
    ],
  },
  {
    slug: 'lyric-video-or-visualiser', title: 'Lyric Video or Visualiser', sortOrder: 5,
    tagline: 'Something to post on release day',
    audience: 'Releases without a shoot budget that still need a moving asset.',
    included: ['Animated typography or audio-reactive visuals', 'Lyric synchronisation', 'Looping background system', '1080p and 4K export', 'Vertical version on higher tiers'],
    required: ['Final audio', 'Lyrics as text', 'Cover art'],
    deliveryDays: '3–6 days', revisions: 'Revisions per package',
    tiers: [
      { name: 'Basic', priceBdt: 4000, recommended: false,
        description: 'Single visualiser or simple lyric video, one visual direction, standard synchronisation.',
        descriptionBn: 'একটি ভিজ্যুয়ালাইজার বা সাধারণ লিরিক ভিডিও, একটি ভিজ্যুয়াল ডিরেকশন, স্ট্যান্ডার্ড সিনক্রোনাইজেশন।' },
      { name: 'Professional', priceBdt: 6000, recommended: true,
        description: 'Custom visual direction, tighter lyric synchronisation, added effects and a vertical cutdown.',
        descriptionBn: 'কাস্টম ভিজ্যুয়াল ডিরেকশন, নিখুঁত লিরিক সিনক্রোনাইজেশন, বাড়তি ইফেক্ট এবং একটি ভার্টিক্যাল কাটডাউন।' },
      { name: 'Premium', priceBdt: 15000, recommended: false,
        description: 'Full animation complexity: scene variety, bespoke visual direction, advanced effects and highest production quality.',
        descriptionBn: 'সম্পূর্ণ অ্যানিমেশন — একাধিক সিন, নিজস্ব ভিজ্যুয়াল ডিরেকশন, অ্যাডভান্সড ইফেক্ট এবং সর্বোচ্চ প্রোডাকশন কোয়ালিটি।' },
    ],
  },
];

/* ---------------- Releases. Spotify IDs verified via oEmbed. ---------------- */
const RELEASES = [
  { slug: 'mantra', title: 'MANTRA', type: 'ALBUM' as const, trackCount: 12, releasedAt: '2022-05-25',
    about: 'Debut instrumental album, built entirely from Desi instrumentation.',
    credits: 'All instrumentation, production, mix and master by SnareByt',
    spotifyUrl: null, live: true, featured: false, sortOrder: 1 },
  { slug: 'too-toxic', title: 'TOO TOXIC', type: 'ALBUM' as const, trackCount: 8, releasedAt: '2023-01-01',
    about: 'Eight tracks of darker, experimental production.',
    credits: 'Produced, mixed and mastered by SnareByt',
    spotifyUrl: 'https://open.spotify.com/album/7iYnFAAPw4CUDBm1pdVwTY', live: true, featured: false, sortOrder: 2 },
  { slug: 'wrong-tape', title: 'WRONG TAPE', type: 'BEAT_TAPE' as const, trackCount: 22, releasedAt: '2023-07-14',
    about: 'Twenty-two hip-hop beats released as one body of work.',
    credits: 'All beats produced by SnareByt',
    spotifyUrl: 'https://open.spotify.com/album/7whDkrIejKyF7JG5sY8f4t', live: true, featured: false, sortOrder: 3 },
  { slug: 'chondo-giti', title: 'Chondo Giti', type: 'SINGLE' as const, trackCount: 1, releasedAt: '2024-03-26',
    about: 'With NIHON.', credits: 'Produced by SnareByt',
    spotifyUrl: 'https://open.spotify.com/track/4Mjg3LKI2a9CmMTZ4bbKUn', live: true, featured: true, sortOrder: 4 },
  { slug: 'katsuki', title: 'KATSUKI', type: 'SINGLE' as const, trackCount: 1, releasedAt: '2023-07-14',
    about: 'From WRONG TAPE — the Spotify artwork is identical to the tape cover.',
    credits: 'Produced by SnareByt',
    spotifyUrl: 'https://open.spotify.com/track/5IOUivWbpp6yP35bX4n9FN', live: true, featured: false, sortOrder: 5 },
  // Confirmed live records still awaiting a Spotify URL from Samir.
  { slug: 'flex-maar', title: 'Flex Maar', type: 'SINGLE' as const, trackCount: 1, releasedAt: null,
    about: '', credits: 'Produced by SnareByt', spotifyUrl: null, live: true, featured: true, sortOrder: 6 },
  { slug: 'kobiraz', title: 'KOBIRAZ', type: 'SINGLE' as const, trackCount: 1, releasedAt: null,
    about: '', credits: 'Produced, mixed and mastered by SnareByt', spotifyUrl: null, live: true, featured: true, sortOrder: 7 },
  { slug: 'street-e-tor', title: 'STREET E TOR', type: 'SINGLE' as const, trackCount: 1, releasedAt: null,
    about: 'With BIHAN · Wrong Side.', credits: 'Produced by SnareByt', spotifyUrl: null, live: true, featured: true, sortOrder: 8 },
  { slug: 'jare-pakhi', title: 'JARE PAKHI', type: 'SINGLE' as const, trackCount: 1, releasedAt: '2022-06-28',
    about: '', credits: 'Produced by SnareByt', spotifyUrl: null, live: true, featured: false, sortOrder: 9 },
  { slug: 'noksha', title: 'NOKSHA', type: 'SINGLE' as const, trackCount: 1, releasedAt: '2021-07-14',
    about: 'With THE BEASTBUZZ.', credits: 'Produced by SnareByt', spotifyUrl: null, live: true, featured: false, sortOrder: 10 },
  // Hidden by default: older or unconfirmed. Nothing appears publicly
  // until Samir switches it on.
  { slug: 'stray', title: 'Stray', type: 'SINGLE' as const, trackCount: 1, releasedAt: '2018-01-01',
    about: 'First release.', credits: 'Produced by SnareByt', spotifyUrl: null, live: false, featured: false, sortOrder: 20 },
];

/* ---------------- Portfolio. Role is required and exact. ---------------- */
const PORTFOLIO = [
  { slug: 'awaaz-utha', title: 'Awaaz Utha', category: 'PRODUCED_BY_SNAREBYT' as const,
    role: 'Producer', clientName: 'Hannan Hossain Shimul', majorCredit: true,
    externalUrl: 'https://en.wikipedia.org/wiki/Awaaz_Utha', ctaLabel: 'Read',
    summary: 'Millions of views on YouTube and billions of views across TikTok. Killaz Kulture, 2024.', sortOrder: 1 },
  { slug: 'kotha-ko', title: 'Kotha Ko', category: 'MIXED_AND_MASTERED_BY_SNAREBYT' as const,
    role: 'Mix & master', clientName: 'SHEZAN', majorCredit: true, externalUrl: null, ctaLabel: 'Listen',
    summary: 'The first protest song of the July movement, and a viral record.', sortOrder: 2 },
  { slug: 'kashundi', title: 'Kashundi', category: 'MIXED_AND_MASTERED_BY_SNAREBYT' as const,
    role: 'Mix & master', clientName: 'SHEZAN', majorCredit: false, externalUrl: null, ctaLabel: 'Listen', summary: '', sortOrder: 3 },
  { slug: 'woop', title: 'Woop', category: 'MIXED_AND_MASTERED_BY_SNAREBYT' as const,
    role: 'Mix & master', clientName: 'SHEZAN', majorCredit: false, externalUrl: null, ctaLabel: 'Listen', summary: '', sortOrder: 4 },
  { slug: 'mc-mugz-selected', title: 'Selected work with MC Mugz', category: 'MIXED_AND_MASTERED_BY_SNAREBYT' as const,
    role: 'Mix & master', clientName: 'MC Mugz', majorCredit: false, externalUrl: null, ctaLabel: 'Listen', summary: '', sortOrder: 5 },
  { slug: 'grameenphone', title: 'Grameenphone campaign song', category: 'MIXED_AND_MASTERED_BY_SNAREBYT' as const,
    role: 'Mix', clientName: 'Grameenphone', majorCredit: false,
    externalUrl: 'https://youtu.be/3f-oUxrQkEI', ctaLabel: 'Watch',
    summary: 'Brand campaign record mixed by SnareByt.', sortOrder: 6 },
  { slug: 'chorki', title: 'Chorki project song', category: 'MIXED_AND_MASTERED_BY_SNAREBYT' as const,
    role: 'Mix', clientName: 'Chorki', majorCredit: false,
    externalUrl: 'https://youtu.be/MjpdJyZHFmE', ctaLabel: 'Watch',
    summary: 'Platform project record mixed by SnareByt.', sortOrder: 7 },
  { slug: 'testy-drrt-gang', title: 'TESTY', category: 'PRODUCED_BY_SNAREBYT' as const,
    role: 'Producer', clientName: 'DRRT Gang', majorCredit: false, externalUrl: null, ctaLabel: 'Listen', summary: '', sortOrder: 8 },
];

/* ---------------- Beats ---------------- */
const BEATS = [
  { slug: 'puran-dhaka',   title: 'Puran Dhaka',   genre: 'Desi Trap',   mood: 'Dark',       bpm: 140, musicalKey: 'F Min',  basePriceBdt: 1500, tags: ['808', 'tabla', 'menace'] },
  { slug: 'ektara-ghost',  title: 'Ektara Ghost',  genre: 'Desi Trap',   mood: 'Cinematic',  bpm: 88,  musicalKey: 'A Min',  basePriceBdt: 2200, tags: ['ektara', 'score', 'storytelling'] },
  { slug: 'baul-drill',    title: 'Baul Drill',    genre: 'Drill',       mood: 'Aggressive', bpm: 144, musicalKey: 'G Min',  basePriceBdt: 1700, tags: ['sliding 808', 'baul', 'cold'] },
  { slug: 'cha-stall-3am', title: 'Cha Stall 3AM', genre: 'Lo-Fi',       mood: 'Chill',      bpm: 76,  musicalKey: 'D Maj',  basePriceBdt: 1200, tags: ['dusty', 'vinyl', 'warm'] },
  { slug: 'neon-nabab',    title: 'Neon Nabab',    genre: 'Desi Trap',   mood: 'Aggressive', bpm: 150, musicalKey: 'E Min',  basePriceBdt: 1900, tags: ['brass', 'anthem', 'hard'] },
  { slug: 'monsoon-drill', title: 'Monsoon Drill', genre: 'Drill',       mood: 'Dark',       bpm: 142, musicalKey: 'A# Min', basePriceBdt: 1650, tags: ['bansuri', 'eerie', 'night'] },
];

async function main() {
  console.log('→ settings');
  const settings: Record<string, string> = {
    usdRate: '122',
    whatsapp: '',                       // Samir to supply; contact button stays hidden until then
    businessEmail: 'snarebyt@gmail.com',
    sslcommerzMode: 'sandbox',          // never flip to live before a sandbox run passes
    downloadExpiryHours: '72',
    downloadMaxAttempts: '5',
  };
  for (const [key, value] of Object.entries(settings)) {
    await db.setting.upsert({ where: { key }, create: { key, value }, update: {} });
  }

  console.log('→ admin user');
  const email = (process.env.ADMIN_EMAIL ?? 'snarebyt@gmail.com').toLowerCase();
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) throw new Error('Set ADMIN_PASSWORD in .env before seeding — no default password is created.');
  await db.user.upsert({
    where: { email },
    create: { email, name: 'Samir Islam', artistName: 'SnareByt', role: 'ADMIN',
              passwordHash: await argon2.hash(pw, { type: argon2.argon2id }), emailVerified: new Date() },
    update: { role: 'ADMIN' },
  });

  console.log('→ licence tiers (bilingual)');
  for (const l of LICENCES) {
    await db.licenceTier.upsert({ where: { code: l.code }, create: l, update: l });
  }

  console.log('→ services and packages');
  for (const s of SERVICES) {
    const { tiers, ...rest } = s;
    const service = await db.service.upsert({
      where: { slug: s.slug }, create: rest, update: rest,
    });
    await db.serviceTier.deleteMany({ where: { serviceId: service.id } });
    await db.serviceTier.createMany({
      data: tiers.map((t, i) => ({ ...t, serviceId: service.id, sortOrder: i })),
    });
  }

  console.log('→ releases');
  const { parseSpotifyUrl } = await import('../src/lib/spotify');
  for (const r of RELEASES) {
    const ref = parseSpotifyUrl(r.spotifyUrl ?? '');
    const data = {
      title: r.title, type: r.type, trackCount: r.trackCount,
      // null stays null — an unknown date must never become a guessed one.
      releasedAt: r.releasedAt ? new Date(r.releasedAt) : null,
      about: r.about, credits: r.credits,
      spotifyUrl: r.spotifyUrl, spotifyEmbedType: ref?.type ?? null, spotifyEmbedId: ref?.id ?? null,
      live: r.live, featured: r.featured, published: r.live, sortOrder: r.sortOrder,
    };
    await db.release.upsert({ where: { slug: r.slug }, create: { slug: r.slug, ...data }, update: data });
  }

  console.log('→ portfolio credits');
  for (const p of PORTFOLIO) {
    await db.portfolioItem.upsert({
      where: { slug: p.slug },
      create: { ...p, published: true },
      update: { ...p, published: true },
    });
  }

  console.log('→ beats (drafts — files must be uploaded before publishing)');
  for (const b of BEATS) {
    await db.beat.upsert({
      where: { slug: b.slug },
      create: { ...b, status: 'DRAFT', exclusiveAvailable: true },
      update: { basePriceBdt: b.basePriceBdt },
    });
  }

  console.log('→ discount codes');
  for (const c of [
    { code: 'SNARE10', percentOff: 10, maxUses: 100 },
    { code: 'FIRSTBEAT', percentOff: 15, maxUses: 50 },
  ]) {
    await db.discountCode.upsert({ where: { code: c.code }, create: c, update: {} });
  }

  console.log('→ site content (pages, sections, nav, theme)');
  const { PAGE_CONTENT, NAV_MENU, NAV_SOCIAL, THEME_TOKENS } = await import('./seed-content');

  for (const [i, pg] of PAGE_CONTENT.entries()) {
    const pageData = {
      label: pg.label, sortOrder: i,
      seoTitle: pg.seoTitle, seoDescription: pg.seoDescription,
    };
    const page = await db.page.upsert({
      where: { slug: pg.slug },
      create: { slug: pg.slug, ...pageData },
      update: pageData,
    });

    for (const [j, sec] of pg.sections.entries()) {
      // `update` deliberately leaves `values` and `visible` alone: re-running the
      // seed must never overwrite copy Samir has edited in the dashboard, or
      // hidden. Only the label and ordering are refreshed.
      await db.pageSection.upsert({
        where: { pageId_key: { pageId: page.id, key: sec.key } },
        create: {
          pageId: page.id, key: sec.key, name: sec.name, about: sec.about,
          values: sec.values as object, sortOrder: j,
        },
        update: { name: sec.name, about: sec.about, sortOrder: j },
      });
    }
  }

  // Nav is replaced wholesale rather than upserted: there is no natural key on
  // NavItem, and re-seeding a link list must not silently duplicate every row.
  await db.navItem.deleteMany({ where: { group: { in: ['MENU', 'SOCIAL'] } } });
  await db.navItem.createMany({
    data: [
      ...NAV_MENU.map((n, i) => ({ group: 'MENU' as const, label: n.label, href: n.href, sortOrder: i, visible: true })),
      ...NAV_SOCIAL.map((n, i) => ({ group: 'SOCIAL' as const, label: n.label, href: n.href, sortOrder: i, visible: n.visible })),
    ],
  });

  for (const [key, value] of Object.entries(THEME_TOKENS)) {
    await db.themeToken.upsert({ where: { key }, create: { key, value }, update: {} });
  }

  console.log('\n✓ Seed complete.');
  console.log('  Beats are DRAFT on purpose — a beat cannot be published until its');
  console.log('  tagged preview and untagged MP3 are uploaded, or buyers get nothing.');
  console.log('  Releases without a Spotify URL show "cover art pending" rather than a fake cover.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
