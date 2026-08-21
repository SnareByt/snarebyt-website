import 'server-only';
import { prisma } from './prisma';

/**
 * Every read the artist portal makes.
 *
 * One rule, applied without exception: the signed-in user's id goes into the
 * WHERE clause, never into an `if` after the row comes back. Fetching by id
 * and then comparing owners is the same bug written a slower way — it works
 * until someone forgets the comparison on one route, and there is no way to
 * see from a page that the check is missing.
 *
 * So these functions take `userId` as their first argument and there is no
 * variant that does not. A page cannot ask this module for somebody else's
 * order, because there is no function here that would answer.
 */

export type OrderRow = {
  id: string;
  number: string;
  status: string;
  totalBdt: number;
  createdAt: Date;
  paidAt: Date | null;
  itemCount: number;
  titles: string[];
  licenceCount: number;
};

export async function listOrders(userId: string): Promise<OrderRow[]> {
  const rows = await prisma.order.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, number: true, status: true, totalBdt: true,
      createdAt: true, paidAt: true,
      items: { select: { titleSnapshot: true, licence: { select: { id: true } } } },
    },
  });

  return rows.map((o) => ({
    id: o.id,
    number: o.number,
    status: o.status,
    totalBdt: o.totalBdt,
    createdAt: o.createdAt,
    paidAt: o.paidAt,
    itemCount: o.items.length,
    titles: o.items.map((i) => i.titleSnapshot),
    licenceCount: o.items.filter((i) => i.licence).length,
  }));
}

/** Null rather than a throw when the order is not theirs — the page renders a 404. */
export async function getOrder(userId: string, orderId: string) {
  return prisma.order.findFirst({
    where: { id: orderId, userId },
    select: {
      id: true, number: true, status: true, createdAt: true, paidAt: true,
      subtotalBdt: true, discountBdt: true, totalBdt: true, usdRateAtSale: true,
      billingName: true, billingEmail: true, billingPhone: true, billingCountry: true,
      artistName: true, customerNote: true,
      // adminNote is deliberately absent. It is the studio's private note on
      // the order and selecting it here is how it ends up in a page payload.
      items: {
        select: {
          id: true, kind: true, titleSnapshot: true, priceBdt: true, quantity: true,
          beat: { select: { title: true, slug: true, coverKey: true } },
          licenceTier: { select: { name: true, filesLabel: true } },
          serviceTier: { select: { name: true, service: { select: { title: true } } } },
          licence: { select: { id: true, number: true, purchasedAt: true } },
        },
      },
      payments: {
        where: { status: 'VALIDATED' },
        select: { id: true, tranId: true, amountBdt: true, createdAt: true, cardType: true },
        orderBy: { createdAt: 'desc' },
      },
      projects: { select: { id: true, number: true, status: true } },
    },
  });
}

/**
 * Live download links for a paid order.
 *
 * Grants are looked up through the order, so a grant belonging to somebody
 * else cannot surface here even if the ids were guessed.
 */
export async function listGrants(userId: string, orderId: string) {
  const items = await prisma.orderItem.findMany({
    where: { orderId, order: { userId, status: 'PAID' } },
    select: { id: true, titleSnapshot: true },
  });
  if (!items.length) return [];

  const grants = await prisma.downloadGrant.findMany({
    where: {
      orderItemId: { in: items.map((i) => i.id) },
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, orderItemId: true, expiresAt: true, attempts: true, maxAttempts: true },
  });

  const byItem = new Map(items.map((i) => [i.id, i.titleSnapshot]));
  return grants.map((g) => ({
    id: g.id,
    title: byItem.get(g.orderItemId) ?? 'Purchase',
    expiresAt: g.expiresAt,
    remaining: Math.max(0, g.maxAttempts - g.attempts),
  }));
}

export type ProjectRow = {
  id: string;
  number: string;
  status: string;
  title: string;
  serviceTitle: string;
  deadline: Date | null;
  updatedAt: Date;
  fileCount: number;
  deliverableCount: number;
  unreadFromStudio: number;
  revisionsUsed: number;
  revisionsAllowed: number;
};

export async function listProjects(userId: string): Promise<ProjectRow[]> {
  const rows = await prisma.project.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true, number: true, status: true, projectTitle: true, deadline: true,
      updatedAt: true, revisionsUsed: true, revisionsAllowed: true,
      service: { select: { title: true } },
      files: { select: { isDeliverable: true } },
      messages: { where: { fromStudio: true, readAt: null }, select: { id: true } },
    },
  });

  return rows.map((p) => ({
    id: p.id,
    number: p.number,
    status: p.status,
    title: p.projectTitle || p.service.title,
    serviceTitle: p.service.title,
    deadline: p.deadline,
    updatedAt: p.updatedAt,
    fileCount: p.files.length,
    deliverableCount: p.files.filter((f) => f.isDeliverable).length,
    unreadFromStudio: p.messages.length,
    revisionsUsed: p.revisionsUsed,
    revisionsAllowed: p.revisionsAllowed,
  }));
}

export async function getProject(userId: string, projectId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, userId },
    select: {
      id: true, number: true, status: true, projectTitle: true, genre: true,
      description: true, referenceLinks: true, deadline: true, formatsWanted: true,
      revisionsUsed: true, revisionsAllowed: true, createdAt: true, updatedAt: true,
      // `notes` is the studio's working note on the brief, not the customer's.
      service: { select: { title: true } },
      serviceTier: { select: { name: true, priceBdt: true } },
      order: { select: { id: true, number: true, status: true } },
      files: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, uploadedBy: true, label: true, filename: true,
          mime: true, bytes: true, isDeliverable: true, createdAt: true,
        },
      },
      messages: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, fromStudio: true, body: true, createdAt: true, readAt: true },
      },
      events: {
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, note: true, createdAt: true },
      },
    },
  });
}

/**
 * A single file, resolved only if the requester owns the project it belongs to.
 *
 * This is the query behind the download route, so the join to the owning user
 * is the entire access check. There is no version of this that takes a file id
 * on its own.
 */
export async function getOwnedFile(userId: string, fileId: string) {
  return prisma.projectFile.findFirst({
    where: { id: fileId, project: { userId } },
    select: {
      id: true, filename: true, objectKey: true, mime: true, bytes: true,
      isDeliverable: true, uploadedBy: true,
      project: { select: { id: true, number: true } },
    },
  });
}

/** Everything the overview needs, in one round trip. */
export async function getOverview(userId: string) {
  const [orders, projects, licences, unread] = await Promise.all([
    prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 4,
      select: {
        id: true, number: true, status: true, totalBdt: true, createdAt: true,
        items: { select: { titleSnapshot: true } },
      },
    }),
    prisma.project.findMany({
      where: { userId, status: { notIn: ['DELIVERED', 'COMPLETED'] } },
      orderBy: { updatedAt: 'desc' },
      take: 4,
      select: {
        id: true, number: true, status: true, projectTitle: true, deadline: true,
        service: { select: { title: true } },
      },
    }),
    prisma.licenceDocument.count({ where: { order: { userId } } }),
    prisma.projectMessage.count({
      where: { fromStudio: true, readAt: null, project: { userId } },
    }),
  ]);

  const paidCount = await prisma.order.count({ where: { userId, status: 'PAID' } });

  return { orders, projects, licences, unread, paidCount };
}
