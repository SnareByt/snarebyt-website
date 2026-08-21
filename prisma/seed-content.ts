/**
 * SITE CONTENT SEED — the approved copy, as database rows.
 *
 * Every string here is lifted verbatim from reference/SnareByt-Admin.html,
 * which is the signed-off specification. Do not reword anything in this file
 * to "improve" it; change it in the admin dashboard instead, which is the
 * whole point of the content model.
 *
 * Shape: page → ordered sections → values keyed by the field spec in
 * src/lib/content-spec.ts. `updateField` treats that spec as an allow-list,
 * so any key added here must also exist in the spec or the admin cannot
 * edit it.
 *
 * Image fields deliberately hold '' rather than a made-up MediaAsset id.
 * A media field stores an id, and an id that resolves to nothing would
 * render a broken image. Empty means "not supplied yet", and the components
 * render the layout without a portrait until Samir uploads one.
 */

export type SectionSeed = {
  key: string;
  name: string;
  about: string;
  values: Record<string, unknown>;
};

export type PageSeed = {
  slug: string;
  label: string;
  seoTitle: string;
  seoDescription: string;
  sections: SectionSeed[];
};

const S = (
  key: string,
  name: string,
  about: string,
  values: Record<string, unknown>,
): SectionSeed => ({ key, name, about, values });

export const PAGE_CONTENT: PageSeed[] = [
  {
    slug: 'home',
    label: 'Home',
    seoTitle: 'SnareByt — Music Producer & Artist | Dhaka',
    seoDescription:
      'SnareByt (Samir Islam) — Bangladeshi music producer and recording artist, mixing and mastering engineer.',
    sections: [
      S('hero', 'Hero', 'The first screen. Headline, roles, buttons, your photo.', {
        tags: [{ t: 'Booking now' }, { t: 'Dhaka, Bangladesh' }, { t: 'Wrong Side' }],
        line1: 'Made in',
        line2: 'Dhaka.',
        line3: 'Heard everywhere.',
        r1: 'Music Producer & Recording Artist',
        r2: 'Mixing & Mastering Engineer',
        r3: 'Cover art · Video editing · Visualisers',
        lead:
          'SnareByt is Samir Islam — tabla, ektara and sarod driven into modern low end, and masters built to survive a phone speaker in Dhaka traffic.',
        cta1: 'Listen to the music →',
        cta1h: '/music',
        cta2: 'Shop Beats',
        cta2h: '/beats',
        cta3: 'Book a Service',
        cta3h: '/services',
        proof: [
          { n: 'MANTRA', l: 'Debut instrumental album' },
          { n: 'WRONG TAPE', l: '22-beat tape · 2023' },
          { n: 'Awaaz Utha', l: 'Produced by SnareByt' },
          { n: 'Kotha Ko', l: 'Mixed & mastered by SnareByt' },
        ],
        portrait: '',
      }),
      S('latest', 'Latest live release', 'Pulls the newest live release automatically.', {
        eyebrow: 'Latest live release',
        body: 'Out now. Press play for the preview, or open it where you listen.',
        btn: '▶ Play preview',
        auto: true,
      }),
      S('intro', 'Producer introduction', 'Who you are, in two paragraphs.', {
        eyebrow: 'The producer',
        h1: 'Records built from',
        h2: 'the culture up',
        p1: 'Tabla, ektara, sarod, bansuri and harmonium played into modern low end — not sampled as decoration.',
        p2: 'He released MANTRA, a debut all-instrumental album, in 2022, followed by TOO TOXIC in 2023.',
        link: 'Read the full story →',
        cards: [
          { t: 'Produce', b: 'Original records from scratch, arranged to your song.' },
          { t: 'Engineer', b: 'Mixing and mastering that translates on every system.' },
          { t: 'Release', b: 'Own catalogue: MANTRA, TOO TOXIC, WRONG TAPE.' },
          { t: 'Direct', b: 'Cover art, video and visualisers when the record needs them.' },
        ],
      }),
      S('recent', 'Selected recent releases', 'The list of live singles.', {
        eyebrow: 'Selected recent releases',
        h1: 'Out now',
        link: 'Full discography →',
      }),
      S('credits', 'Major credits', 'Records produced or engineered for other artists.', {
        eyebrow: 'Major credits',
        h1: 'Records for',
        h2: 'other artists',
        link: 'All production & engineering credits →',
      }),
      S('featured', 'Featured tracks', 'Tracks pinned as Featured in Releases.', {
        eyebrow: 'Featured tracks',
        h1: 'Start here',
      }),
      S('store', 'Beat store preview', 'Four beats from the store.', {
        eyebrow: 'Beat store',
        h1: 'Lease it or own it',
        h2: 'outright',
        link: 'Browse all beats →',
      }),
      S('mixwork', 'Mixing & mastering work', 'Engineering credits grid.', {
        eyebrow: 'Mixed & mastered by SnareByt',
        h1: 'Engineering credits',
        link: 'See all credits →',
      }),
      S('services', 'Services', 'Your five service cards.', {
        eyebrow: 'Services',
        h1: 'Hire the studio',
        link: 'All packages & pricing →',
      }),
      S('visual', 'Selected visual work', 'Cover art, video, visualisers.', {
        eyebrow: 'Selected visual work',
        h1: 'Cover art, video, visualisers',
        link: 'Visual portfolio →',
      }),
      // Deliberately empty. Inventing a client quote on a real person's site is
      // a reputational risk, not a design flourish. The section renders empty
      // placeholder slots until real quotes with permission to publish arrive.
      S('testimonials', 'Testimonials', 'Real client quotes only.', {
        eyebrow: 'Testimonials',
        h1: 'What artists say',
        quotes: [],
      }),
      S('cta', 'Booking call to action', 'The big red box near the bottom.', {
        eyebrow: 'Next step',
        h1: "Let's build your",
        h2: 'next release',
        body: 'Tell me the record you hear in your head. You get a price and a delivery date back, not a vague reply.',
        b1: 'Start a project →',
        b1h: '/contact',
        b2: 'Buy a beat instead',
        b2h: '/beats',
      }),
      S('news', 'Newsletter & socials', 'Email capture and your links.', {
        eyebrow: 'New beats & releases first',
        ph: 'your@email.com',
        btn: 'Subscribe',
        note: 'Double opt-in. Unsubscribe any time.',
      }),
    ],
  },

  {
    slug: 'music',
    label: 'Music',
    seoTitle: 'Music — SnareByt',
    seoDescription: 'Albums, mixtapes, singles and production credits.',
    sections: [
      S('head', 'Page header', '', {
        eyebrow: 'Discography',
        h1: 'The',
        h2: 'catalogue',
        lead: 'Albums and mixtapes first, then live singles and collaborations, then records produced for other artists.',
      }),
      S('projects', 'Projects', 'Albums and mixtapes.', {
        eyebrow: 'Projects',
        h1: 'Albums & mixtapes',
        lead: 'MANTRA is the debut instrumental album, followed by TOO TOXIC and WRONG TAPE.',
      }),
      S('singles', 'Singles & collaborations', '', {
        eyebrow: 'Singles & collaborations',
        link: 'Follow on Spotify →',
      }),
      S('spotify', 'Spotify players', 'Live players for releases with a Spotify link.', {
        eyebrow: 'Play on Spotify',
        h1: 'Live now',
        lead: 'Real Spotify players — real audio, real cover art, straight from your catalogue.',
      }),
      S('collabs', 'Collaborators', 'Names shown as pills.', {
        eyebrow: 'Collaborators',
        h1: 'Worked with',
        names: [
          'HANNAN', 'SHEZAN', '1230 Klassick', 'THE BEASTBUZZ', 'NIHON',
          'BIHAN', 'T. Zed', 'DRRT Gang', 'MC Mugz', 'Wrong Side',
        ].map((t) => ({ t })),
      }),
    ],
  },

  {
    slug: 'beats',
    label: 'Beat store',
    seoTitle: 'Beats — SnareByt',
    seoDescription: 'Desi trap, drill and R&B beats. Five licence tiers.',
    sections: [
      S('head', 'Page header', '', {
        eyebrow: 'Beat store',
        h1: 'Beats built to',
        h2: 'carry a song',
        lead: 'Five licence tiers. Files and licence documents are emailed the moment payment clears.',
      }),
      // The single most misunderstood thing in a beat store, so it is stated
      // plainly and in both languages before anyone reaches a price.
      S('nonx', 'Non-exclusive explainer', 'The box buyers actually need. Both languages.', {
        h1: 'What does “non-exclusive” actually mean?',
        en: 'Every licence except Exclusive Rights is a lease. The beat stays in the store after you buy it, and other artists can licence the same beat. Only Exclusive Rights takes it off sale permanently.',
        bn: 'এক্সক্লুসিভ রাইটস ছাড়া বাকি সব লাইসেন্সই আসলে লিজ। আপনি কেনার পরেও বিটটি স্টোরে থেকে যাবে, এবং অন্য শিল্পীরাও একই বিট নিয়ে গান রিলিজ করতে পারবে। শুধুমাত্র এক্সক্লুসিভ রাইটস কিনলে বিটটি স্থায়ীভাবে সরিয়ে ফেলা হয়।',
      }),
      S('lic', 'Licensing section', '', {
        eyebrow: 'Licensing · লাইসেন্সিং',
        h1: 'Know exactly what you are buying',
        lead: "Full terms in English and Bangla. Prices scale with each beat's base price.",
        bnNote: 'প্রতিটি শর্ত ইংরেজি ও বাংলা — দুই ভাষাতেই দেওয়া আছে।',
      }),
    ],
  },

  {
    slug: 'services',
    label: 'Services',
    seoTitle: 'Services — SnareByt',
    seoDescription: 'Custom beats, mixing and mastering, cover art, video editing.',
    sections: [
      S('head', 'Page header', '', {
        eyebrow: 'Services',
        h1: 'Hire the',
        h2: 'whole studio',
        lead: 'Every package lists what is included, what I need from you, and when it ships.',
      }),
      S('proof', 'Proof block', 'Replaces the old before/after slider.', {
        eyebrow: 'Proof',
        h1: 'The credits are the demo',
        body: 'Judge the work by the records themselves — production and mix credits for SHEZAN, Grameenphone, Chorki and Hannan Hossain Shimul.',
        btn: 'See the credits →',
      }),
      S('faq', 'FAQ', '', {
        eyebrow: 'FAQ',
        h1: 'Common questions',
        items: [
          { q: 'How do revisions work?', a: 'Every tier includes revisions, rising through Basic, Professional and Premium.' },
          { q: 'What do you need from me to start?', a: '24-bit WAV files from bar one, a reference track, and a short written brief.' },
          { q: 'Do you offer refunds?', a: 'Completed creative work cannot be refunded once delivered. Work not started is refunded in full.' },
          { q: 'What payment methods are accepted?', a: 'All methods through SSLCOMMERZ — cards, mobile financial services and internet banking.' },
        ],
      }),
    ],
  },

  {
    slug: 'portfolio',
    label: 'Portfolio',
    seoTitle: 'Portfolio — SnareByt',
    seoDescription: 'Production and engineering credits.',
    sections: [
      S('head', 'Page header', '', {
        eyebrow: 'Portfolio',
        h1: 'Production &',
        h2: 'engineering credits',
        lead: 'Every item states the exact role — produced, mixed, or both.',
      }),
      S('cta', 'Bottom call to action', '', {
        h1: 'Send your',
        h2: 'session',
        body: 'Mixing, mastering and custom production. Upload your stems, get a price and a delivery date back.',
        b1: 'See packages →',
        b1h: '/services',
        b2: 'Send a brief',
        b2h: '/contact',
      }),
    ],
  },

  {
    slug: 'about',
    label: 'About',
    seoTitle: 'About — SnareByt',
    seoDescription: 'Samir Islam. Producer, recording artist and engineer from Dhaka.',
    sections: [
      S('head', 'Page header', '', {
        eyebrow: 'About',
        h1: 'Samir Islam.',
        h2: 'SnareByt.',
        lead: 'Music producer and recording artist from Dhaka. Mixing and mastering engineer. Member of Wrong Side.',
      }),
      S('story', 'Story', 'Your biography, one paragraph per row.', {
        paras: [
          { p: 'SnareByt makes records that sound like where they came from. Not Bangladeshi hip-hop imitating American production — Bangladeshi hip-hop that could only have been made in Dhaka.' },
          { p: 'In 2022 he released MANTRA, his debut instrumental album, built entirely from Desi instrumentation.' },
          { p: 'TOO TOXIC followed in 2023 — eight tracks, darker and more experimental. WRONG TAPE came out of the Wrong Side collective in the same period.' },
          { p: 'He produced Awaaz Utha for Hannan Hossain Shimul in 2024 — a record that has taken millions of views on YouTube and billions of views across TikTok.' },
          { p: 'He also mixed and mastered Kotha Ko for SHEZAN — the first protest song of the July movement, and a record that went viral off the back of it.' },
        ],
        portrait: '',
      }),
      S('name', 'The name', 'What snare and byt mean.', {
        eyebrow: 'The name',
        p1: 'Snare — the drum. The hit in the middle of the bar that makes a room move before anyone has decided whether they like the song. The human part.',
        p2: 'Byt — bite, taken from a snake’s strike. Fast, exact, and impossible to ignore once it has landed. The part that stays with you.',
        p3: 'A snare you feel. A bite you remember. Feel first, precision second, and nothing shipped until both are true.',
      }),
      S('stats', 'Highlight cards', 'Four boxes beside your photo.', {
        items: [
          { n: 'MANTRA', l: 'Debut instrumental album' },
          { n: 'TOO TOXIC', l: 'Album · 2023' },
          { n: 'WRONG TAPE', l: '22-beat tape · 2023' },
          { n: 'Awaaz Utha', l: 'Produced by SnareByt' },
        ],
      }),
      S('cards', 'Detail cards', 'Philosophy, sound, credits, vision.', {
        items: [
          { t: 'Production philosophy', b: 'A record is finished when removing anything would hurt it — not when the arrangement is full.' },
          { t: 'Signature sound', b: 'Desi instrumentation against modern low end. Played and arranged as the foundation of the record.' },
          { t: 'Mixing & mastering', b: 'From one beat and a lead vocal up to unlimited stems.' },
          { t: 'Collaborations', b: 'HANNAN · SHEZAN · 1230 Klassick · THE BEASTBUZZ · NIHON · BIHAN · T. Zed · DRRT Gang · MC Mugz' },
          { t: 'Major credits', b: 'Produced Awaaz Utha. Mixed and mastered Kotha Ko, Kashundi and Woop for SHEZAN.' },
          { t: 'Future vision', b: 'Build SnareByt into a full independent label and creative studio.' },
        ],
      }),
    ],
  },

  {
    slug: 'contact',
    label: 'Contact',
    seoTitle: 'Contact & booking — SnareByt',
    seoDescription: 'Start a project with SnareByt.',
    sections: [
      S('head', 'Page header', '', {
        eyebrow: 'Contact & booking',
        h1: 'Start a',
        h2: 'project',
        lead: 'Tell me what you are making. Every enquiry gets a reply within one business day.',
      }),
      S('details', 'Contact details', 'Shown beside the form.', {
        rows: [
          { k: 'Business', v: 'snarebyt@gmail.com' },
          { k: 'Bookings', v: 'booking@snarebyt.com' },
          { k: 'Support', v: 'support@snarebyt.com' },
          { k: 'WhatsApp', v: 'Instant support, direct from SnareByt' },
          { k: 'Response', v: 'Within 1 business day' },
          { k: 'Studio hours', v: 'Sun–Thu, 11:00–21:00 (GMT+6)' },
        ],
        waLabel: 'Message on WhatsApp →',
        waNote: 'Set your number in Settings and this button goes live.',
      }),
      S('faq', 'Good to know', '', {
        eyebrow: 'Good to know',
        items: [
          { q: 'How fast will I hear back?', a: 'Within one business day, always with a price and a delivery date.' },
          { q: 'Do you take a deposit?', a: 'Service projects start on 50% deposit, balance on final delivery. Beats are paid in full and delivered instantly.' },
          { q: 'Can I talk to you directly?', a: 'No scheduled calls — but you get instant support on WhatsApp, straight from SnareByt.' },
        ],
      }),
    ],
  },
];

/** Main menu. Order here is the order on the site. */
export const NAV_MENU = [
  { label: 'Home', href: '/' },
  { label: 'Music', href: '/music' },
  { label: 'Beats', href: '/beats' },
  { label: 'Services', href: '/services' },
  { label: 'Portfolio', href: '/portfolio' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
];

/**
 * Streaming and social profiles. YouTube is seeded with an empty href and
 * visible:false because no channel URL has been confirmed — an empty href is
 * force-hidden by getNav(), so an unfinished profile can never render as a
 * dead icon. Fill it in from Menu & links when the URL is known.
 */
export const NAV_SOCIAL = [
  { label: 'Instagram', href: 'https://www.instagram.com/snare_byt/', visible: true },
  { label: 'SoundCloud', href: 'https://soundcloud.com/snare_byt', visible: true },
  { label: 'Spotify', href: 'https://open.spotify.com/artist/2VOTkVCgstC2AeDWS2gISL', visible: true },
  { label: 'Apple Music', href: 'https://music.apple.com/us/artist/snarebyt/1439579190', visible: true },
  { label: 'TIDAL', href: 'https://tidal.com/browse/artist/10485420', visible: true },
  { label: 'Deezer', href: 'https://www.deezer.com/us/artist/52802352', visible: true },
  { label: 'Facebook', href: 'https://www.facebook.com/SnareByt/', visible: true },
  { label: 'YouTube', href: '', visible: false },
];

/** Brand tokens. Same values as globals.css, so a fresh database looks identical. */
export const THEME_TOKENS: Record<string, string> = {
  red: '#E01B36',
  ink: '#040405',
  text: '#F4F4F6',
  radius: '18',
  motion: 'true',
  grain: 'true',
  displayFont: 'Syne',
};
