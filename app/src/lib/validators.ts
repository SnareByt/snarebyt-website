import { z } from 'zod';

/**
 * Password policy, enforced server-side on creation and change.
 * The client checklist is UX; this is the rule.
 */
export const passwordSchema = z.string()
  .min(10, 'At least 10 characters')
  .regex(/[A-Z]/, 'One uppercase letter')
  .regex(/[a-z]/, 'One lowercase letter')
  .regex(/[0-9]/, 'One number');


/**
 * One schema per entity, shared by the form and the server action.
 * The client check is a courtesy; this is the check that counts,
 * because a server action is a public HTTP endpoint.
 */

export const beatSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1, 'Title is required').max(120),
  genre: z.string().trim().min(1, 'Genre is required').max(60),
  mood: z.string().trim().max(60).default(''),
  bpm: z.coerce.number().int().min(40, 'BPM must be 40–220').max(220),
  musicalKey: z.string().trim().max(20).default(''),
  tags: z.string().trim().default(''),
  basePriceBdt: z.coerce.number().int().min(100, 'Minimum ৳100'),
  status: z.enum(['DRAFT', 'PUBLISHED', 'SOLD_EXCLUSIVE', 'ARCHIVED']),
  exclusiveAvailable: z.coerce.boolean().default(true),
  description: z.string().trim().max(2000).optional(),
});

export const releaseSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1, 'Title is required').max(160),
  type: z.enum(['SINGLE', 'EP', 'ALBUM', 'BEAT_TAPE', 'COLLABORATION']),
  trackCount: z.coerce.number().int().min(1).max(100).default(1),
  releasedAt: z.coerce.date({ message: 'Release date is required' }),
  about: z.string().trim().max(2000).default(''),
  credits: z.string().trim().max(500).default(''),
  spotifyUrl: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || /open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(album|track|playlist)\/[A-Za-z0-9]{22}/.test(v),
      'That is not a Spotify album or track link'
    )
    .default(''),
  live: z.coerce.boolean().default(false),
  featured: z.coerce.boolean().default(false),
});

export const portfolioSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1, 'Title is required').max(160),
  clientName: z.string().trim().min(1, 'Artist or brand is required').max(120),
  category: z.enum([
    'PRODUCED_BY_SNAREBYT',
    'MIXED_AND_MASTERED_BY_SNAREBYT',
    'SNAREBYT_RELEASES',
    'SELECTED_VISUAL_WORK',
  ]),
  // Required on purpose: this is what stops a mix credit ever being
  // displayed as a production credit.
  role: z.string().trim().min(1, 'Role is required — a credit cannot be published without it').max(80),
  externalUrl: z.string().trim().url('Must be a full URL').or(z.literal('')).default(''),
  ctaLabel: z.enum(['Listen', 'Watch', 'Read', 'Open']).default('Listen'),
  majorCredit: z.coerce.boolean().default(false),
  summary: z.string().trim().max(1000).default(''),
  published: z.coerce.boolean().default(true),
});

export const serviceTierSchema = z.object({
  id: z.string(),
  priceBdt: z.coerce.number().int().min(1, 'Price must be above zero'),
  description: z.string().trim().min(1, 'English description is required').max(1000),
  // Bangla is not optional. A Bangladeshi buyer must never be shown
  // an English-only description of what they are paying for.
  descriptionBn: z.string().trim().min(1, 'বাংলা বিবরণ আবশ্যক — Bangla description is required').max(1000),
});

export const settingsSchema = z.object({
  usdRate: z.coerce.number().min(1).max(1000),
  whatsapp: z
    .string()
    .trim()
    .transform((v) => v.replace(/[^0-9]/g, ''))
    .refine((v) => v === '' || v.length >= 10, 'Include the country code, digits only'),
  businessEmail: z.string().trim().email(),
});

export const discountSchema = z.object({
  code: z.string().trim().min(3).max(24).transform((v) => v.toUpperCase()),
  percentOff: z.coerce.number().int().min(1).max(90),
  maxUses: z.coerce.number().int().min(1).max(100000).default(100),
});

export type BeatInput = z.infer<typeof beatSchema>;
export type ReleaseInput = z.infer<typeof releaseSchema>;
export type PortfolioInput = z.infer<typeof portfolioSchema>;
