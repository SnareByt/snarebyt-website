/**
 * FIELD SPECS — the shape of every editable section.
 *
 * Values live in the database (PageSection.values as JSON); the spec
 * lives here in code. That split means adding a paragraph to a section
 * is a one-line change with no migration, while the admin still gets a
 * properly typed editor (text vs image vs list vs Bangla).
 *
 * Media fields store a MediaAsset id, never a URL — replacing a file
 * updates every page that uses it.
 */
export type FieldType =
  | 'text' | 'area' | 'bn' | 'link' | 'toggle' | 'colour' | 'num'
  | 'image' | 'audio' | 'list';

export type Field = {
  k: string;
  l: string;
  t: FieldType;
  h?: string;
  item?: Field[];     // for t: 'list'
  min?: number;
  max?: number;
};

export type SectionSpec = {
  key: string;
  name: string;
  about: string;
  fields: Field[];
};

const f = (k: string, l: string, t: FieldType = 'text', h = '', extra: Partial<Field> = {}): Field =>
  ({ k, l, t, h, ...extra });

export const SECTION_SPECS: Record<string, SectionSpec[]> = {
  home: [
    {
      key: 'hero', name: 'Hero', about: 'The first screen. Headline, roles, buttons, your photo.',
      fields: [
        f('tags', 'Tags above the headline', 'list', 'Small pills. Keep them short.', { item: [f('t', 'Text')] }),
        f('line1', 'Headline line 1'), f('line2', 'Headline line 2 (chrome)'), f('line3', 'Headline line 3 (italic)'),
        f('r1', 'Primary role'), f('r2', 'Second role'), f('r3', 'Third role'),
        f('lead', 'Intro paragraph', 'area'),
        f('cta1', 'Button 1 label'), f('cta1h', 'Button 1 link', 'link'),
        f('cta2', 'Button 2 label'), f('cta2h', 'Button 2 link', 'link'),
        f('cta3', 'Button 3 label'), f('cta3h', 'Button 3 link', 'link'),
        f('proof', 'Proof strip', 'list', 'Four credentials under the buttons.',
          { item: [f('n', 'Title'), f('l', 'Caption')] }),
        f('portrait', 'Portrait image', 'image', 'Portrait crop, 1600×2000 or larger.'),
      ],
    },
    { key: 'latest', name: 'Latest live release', about: 'Pulls the newest live release automatically.',
      fields: [f('eyebrow', 'Section label'), f('body', 'Line under the title', 'area'),
        f('btn', 'Play button label'), f('auto', 'Always show the newest release', 'toggle')] },
    { key: 'intro', name: 'Producer introduction', about: 'Who you are, in two paragraphs.',
      fields: [f('eyebrow', 'Section label'), f('h1', 'Headline'), f('h2', 'Headline (red italic)'),
        f('p1', 'Paragraph 1', 'area'), f('p2', 'Paragraph 2', 'area'), f('link', 'Link label'),
        f('cards', 'Four small cards', 'list', '', { item: [f('t', 'Title'), f('b', 'Text', 'area')] })] },
    { key: 'recent', name: 'Selected recent releases', about: 'The list of live singles.',
      fields: [f('eyebrow', 'Section label'), f('h1', 'Headline'), f('link', 'Link label')] },
    { key: 'credits', name: 'Major credits', about: 'Records produced or engineered for other artists.',
      fields: [f('eyebrow', 'Section label'), f('h1', 'Headline'), f('h2', 'Headline (red italic)'), f('link', 'Link label')] },
    { key: 'featured', name: 'Featured tracks', about: 'Tracks pinned as Featured in Releases.',
      fields: [f('eyebrow', 'Section label'), f('h1', 'Headline')] },
    { key: 'store', name: 'Beat store preview', about: 'Four beats from the store.',
      fields: [f('eyebrow', 'Section label'), f('h1', 'Headline'), f('h2', 'Headline (red italic)'), f('link', 'Link label')] },
    { key: 'mixwork', name: 'Mixing & mastering work', about: 'Engineering credits grid.',
      fields: [f('eyebrow', 'Section label'), f('h1', 'Headline'), f('link', 'Link label')] },
    { key: 'services', name: 'Services', about: 'Your five service cards.',
      fields: [f('eyebrow', 'Section label'), f('h1', 'Headline'), f('link', 'Link label')] },
    { key: 'visual', name: 'Selected visual work', about: 'Cover art, video, visualisers.',
      fields: [f('eyebrow', 'Section label'), f('h1', 'Headline'), f('link', 'Link label')] },
    { key: 'testimonials', name: 'Testimonials', about: 'Real client quotes only.',
      fields: [f('eyebrow', 'Section label'), f('h1', 'Headline'),
        f('quotes', 'Quotes', 'list', 'Leave empty until you have permission to publish a name.',
          { item: [f('q', 'Quote', 'area'), f('n', 'Name'), f('r', 'Role')] })] },
    { key: 'cta', name: 'Booking call to action', about: 'The big red box near the bottom.',
      fields: [f('eyebrow', 'Section label'), f('h1', 'Headline'), f('h2', 'Headline (red italic)'),
        f('body', 'Paragraph', 'area'), f('b1', 'Button 1'), f('b1h', 'Button 1 link', 'link'),
        f('b2', 'Button 2'), f('b2h', 'Button 2 link', 'link')] },
    { key: 'news', name: 'Newsletter & socials', about: 'Email capture and your links.',
      fields: [f('eyebrow', 'Section label'), f('ph', 'Input placeholder'), f('btn', 'Button label'),
        f('note', 'Small print', 'area')] },
  ],

  beats: [
    { key: 'head', name: 'Page header', about: '',
      fields: [f('eyebrow', 'Section label'), f('h1', 'Headline'), f('h2', 'Headline (red italic)'), f('lead', 'Intro', 'area')] },
    { key: 'nonx', name: 'Non-exclusive explainer', about: 'The box buyers actually need. Both languages.',
      fields: [f('h1', 'Heading'), f('en', 'English explanation', 'area'), f('bn', 'বাংলা ব্যাখ্যা', 'bn')] },
    { key: 'lic', name: 'Licensing section', about: '',
      fields: [f('eyebrow', 'Section label'), f('h1', 'Headline'), f('lead', 'Intro', 'area'), f('bnNote', 'বাংলা লাইন', 'bn')] },
  ],

  about: [
    { key: 'head', name: 'Page header', about: '',
      fields: [f('eyebrow', 'Section label'), f('h1', 'Headline'), f('h2', 'Headline (red italic)'), f('lead', 'Intro', 'area')] },
    { key: 'story', name: 'Story', about: 'Your biography, one paragraph per row.',
      fields: [f('paras', 'Paragraphs', 'list', '', { item: [f('p', 'Paragraph', 'area')] }),
        f('portrait', 'Portrait image', 'image')] },
    { key: 'name', name: 'The name', about: 'What snare and byt mean.',
      fields: [f('eyebrow', 'Section label'), f('p1', 'Snare', 'area'), f('p2', 'Byt', 'area'), f('p3', 'Together', 'area')] },
    { key: 'stats', name: 'Highlight cards', about: 'Four boxes beside your photo.',
      fields: [f('items', 'Cards', 'list', '', { item: [f('n', 'Title'), f('l', 'Caption')] })] },
    { key: 'cards', name: 'Detail cards', about: 'Philosophy, sound, credits, vision.',
      fields: [f('items', 'Cards', 'list', '', { item: [f('t', 'Title'), f('b', 'Text', 'area')] })] },
  ],

  music: [
    { key: 'head', name: 'Page header', about: '',
      fields: [f('eyebrow', 'Section label'), f('h1', 'Headline'), f('h2', 'Headline (red italic)'), f('lead', 'Intro', 'area')] },
    { key: 'projects', name: 'Projects', about: 'Albums and mixtapes.',
      fields: [f('eyebrow', 'Section label'), f('h1', 'Headline'), f('lead', 'Line underneath', 'area')] },
    { key: 'singles', name: 'Singles & collaborations', about: '',
      fields: [f('eyebrow', 'Section label'), f('link', 'Link label')] },
    { key: 'spotify', name: 'Spotify players', about: 'Live players for releases with a Spotify link.',
      fields: [f('eyebrow', 'Section label'), f('h1', 'Headline'), f('lead', 'Line underneath', 'area')] },
    { key: 'collabs', name: 'Collaborators', about: 'Names shown as pills.',
      fields: [f('eyebrow', 'Section label'), f('h1', 'Headline'),
        f('names', 'Names', 'list', '', { item: [f('t', 'Name')] })] },
  ],

  services: [
    { key: 'head', name: 'Page header', about: '',
      fields: [f('eyebrow', 'Section label'), f('h1', 'Headline'), f('h2', 'Headline (red italic)'), f('lead', 'Intro', 'area')] },
    { key: 'proof', name: 'Proof block', about: 'Replaces the old before/after slider.',
      fields: [f('eyebrow', 'Section label'), f('h1', 'Headline'), f('body', 'Paragraph', 'area'), f('btn', 'Button label')] },
    { key: 'faq', name: 'FAQ', about: '',
      fields: [f('eyebrow', 'Section label'), f('h1', 'Headline'),
        f('items', 'Questions', 'list', '', { item: [f('q', 'Question'), f('a', 'Answer', 'area')] })] },
  ],

  portfolio: [
    { key: 'head', name: 'Page header', about: '',
      fields: [f('eyebrow', 'Section label'), f('h1', 'Headline'), f('h2', 'Headline (red italic)'), f('lead', 'Intro', 'area')] },
    { key: 'cta', name: 'Bottom call to action', about: '',
      fields: [f('h1', 'Headline'), f('h2', 'Headline (red italic)'), f('body', 'Paragraph', 'area'),
        f('b1', 'Button 1'), f('b1h', 'Button 1 link', 'link'), f('b2', 'Button 2'), f('b2h', 'Button 2 link', 'link')] },
  ],

  contact: [
    { key: 'head', name: 'Page header', about: '',
      fields: [f('eyebrow', 'Section label'), f('h1', 'Headline'), f('h2', 'Headline (red italic)'), f('lead', 'Intro', 'area')] },
    { key: 'details', name: 'Contact details', about: 'Shown beside the form.',
      fields: [f('rows', 'Rows', 'list', '', { item: [f('k', 'Label'), f('v', 'Value')] }),
        f('waLabel', 'WhatsApp button label'), f('waNote', 'Line under the button', 'area')] },
    { key: 'faq', name: 'Good to know', about: '',
      fields: [f('eyebrow', 'Section label'),
        f('items', 'Questions', 'list', '', { item: [f('q', 'Question'), f('a', 'Answer', 'area')] })] },
  ],
};

/** Page slugs in navigation order. The seed and the admin page picker both use this. */
export const PAGE_SLUGS = ['home', 'music', 'beats', 'services', 'portfolio', 'about', 'contact'] as const;

export function specFor(pageSlug: string, sectionKey: string): SectionSpec | undefined {
  return SECTION_SPECS[pageSlug]?.find((s) => s.key === sectionKey);
}
