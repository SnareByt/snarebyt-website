import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { renderLicencePdf, type LicencePdfData } from '../src/lib/licence-pdf';

async function main() {
const output = path.join(process.cwd(), 'output', 'pdf');
await mkdir(output, { recursive: true });

const common: Omit<LicencePdfData, 'number' | 'tierName' | 'priceBdt' | 'isExclusive' |
  'transfersOwnership' | 'filesLabel' | 'performanceRights' | 'termsEnglish' | 'termsBangla'> = {
  orderNumber: 'SB-2026-SAMPLE', licenseeName: 'Sample Artist',
  licenseeEmail: 'artist@example.com', beatTitle: 'Puran Dhaka',
  purchasedAt: new Date('2026-08-20T10:00:00.000Z'), creditRequired: true,
};

const nonExclusive = await renderLicencePdf({
  ...common, number: 'SB-LIC-2026-NONEX', tierName: 'WAV Licence', priceBdt: 3600,
  isExclusive: false, transfersOwnership: false,
  filesLabel: 'WAV 24-bit + MP3 320kbps', performanceRights: 'Live performances allowed',
  termsEnglish: [
    'Non-exclusive - the beat stays on sale for others', 'Up to 150,000 streams total',
    'Up to 5,000 paid sales', '1 music video', 'Live performances allowed',
    '2 radio stations', 'Full monetisation allowed', 'Credit required: "Prod. SnareByt"',
    'SnareByt keeps full ownership',
  ].join('\n'),
  termsBangla: [
    'নন-এক্সক্লুসিভ - বিটটি অন্যদের জন্যও বিক্রিতে থাকবে', 'সর্বমোট ১,৫০,০০০ স্ট্রিম পর্যন্ত',
    'সর্বোচ্চ ৫,০০০টি পেইড সেল', '১টি মিউজিক ভিডিও', 'লাইভ পারফরম্যান্স করা যাবে',
    '২টি রেডিও স্টেশন', 'সম্পূর্ণ মনিটাইজেশন করা যাবে', 'ক্রেডিট দিতে হবে: "Prod. SnareByt"',
    'মালিকানা SnareByt-এর কাছেই থাকবে',
  ].join('\n'),
});

const exclusive = await renderLicencePdf({
  ...common, number: 'SB-LIC-2026-EXCL', tierName: 'Exclusive Rights', priceBdt: 39000,
  isExclusive: true, transfersOwnership: true,
  filesLabel: 'WAV + MP3 + stems + signed exclusive contract',
  performanceRights: 'Unlimited live performances',
  termsEnglish: [
    'EXCLUSIVE - the beat is removed from the store and nobody else can ever licence it',
    'Unlimited streams', 'Unlimited paid sales', 'Unlimited music videos',
    'Unlimited live performances', 'Unlimited radio', 'Full monetisation allowed',
    'Credit required: "Prod. SnareByt"', 'Master ownership transferred per contract',
  ].join('\n'),
  termsBangla: [
    'এক্সক্লুসিভ - বিটটি স্টোর থেকে সরিয়ে ফেলা হবে, অন্য কেউ আর কখনও এটি লাইসেন্স নিতে পারবে না',
    'আনলিমিটেড স্ট্রিম', 'আনলিমিটেড পেইড সেল', 'আনলিমিটেড মিউজিক ভিডিও',
    'আনলিমিটেড লাইভ পারফরম্যান্স', 'আনলিমিটেড রেডিও', 'সম্পূর্ণ মনিটাইজেশন করা যাবে',
    'ক্রেডিট দিতে হবে: "Prod. SnareByt"', 'চুক্তি অনুযায়ী মাস্টার মালিকানা হস্তান্তর করা হবে',
  ].join('\n'),
});

await Promise.all([
  writeFile(path.join(output, 'snarebyt-non-exclusive-licence-sample.pdf'), nonExclusive),
  writeFile(path.join(output, 'snarebyt-exclusive-licence-sample.pdf'), exclusive),
]);
console.log(`Rendered ${nonExclusive.length} and ${exclusive.length} bytes.`);
}

main().catch((error) => { console.error(error); process.exit(1); });
