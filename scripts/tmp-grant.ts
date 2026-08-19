import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
const p = new PrismaClient();
(async () => {
  const o = await p.order.findUnique({ where: { number: 'SB-PDFTEST-1' }, include: { items: true } });
  const raw = 'pdftest' + Date.now().toString(36);
  await p.downloadGrant.create({ data: {
    orderItemId: o!.items[0].id, tokenHash: createHash('sha256').update(raw).digest('hex'),
    maxAttempts: 9, expiresAt: new Date(Date.now() + 3600_000) } });
  console.log(raw);
  await p.$disconnect();
})();
