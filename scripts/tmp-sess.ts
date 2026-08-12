import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
const p = new PrismaClient();
(async () => {
  const u = await p.user.findFirst({ where: { role: 'ADMIN' } });
  const raw = randomBytes(32).toString('base64url');
  await p.session.create({ data: { userId: u!.id,
    token: createHash('sha256').update(raw).digest('hex'),
    expiresAt: new Date(Date.now() + 1800_000) } });
  const o = await p.order.findFirst({ where: { number: 'SB-2026-000001' } });
  console.log(JSON.stringify({ token: raw, orderId: o?.id }));
  await p.$disconnect();
})();
