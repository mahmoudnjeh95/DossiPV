import { db } from '@dossipv/db';
import { generateToken, hashToken } from '@dossipv/auth';
import type { SubscriptionLike } from './subscription';

/**
 * Sponsoring (spec 2026-10-23 §5): a supplier (fournisseur) pays for installers' Standard plan and
 * those installers can use only the panels and inverters the supplier carries. The lock lives in
 * the installer's LIBRARY: every library-based scope (sizing, dropdowns, save checks) then follows
 * without change, and items already saved in a project stay valid (equipmentChoiceScope keeps them).
 */

export const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
/** Only panels and inverters are locked: the supplier sells those. Everything else is the shared catalog. */
export const LOCKED_KINDS = ['PV_MODULE', 'INVERTER'] as const;

/** A refusal with a message fit for the user (French). */
export class SponsorshipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SponsorshipError';
  }
}

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/** The shared, published, sourced catalog items a supplier carries: what its installers may use. */
async function carriedItemIds(supplierId: string): Promise<{ modules: string[]; inverters: string[] }> {
  const published = { ownerCompanyId: null, catalogStatus: 'PUBLISHED' as const, datasheetSourceUrl: { not: null } };
  const products = await db.supplierProduct.findMany({
    where: { supplierCompanyId: supplierId, OR: [{ pvModule: published }, { inverter: published }] },
    select: { pvModuleId: true, inverterId: true },
  });
  return {
    modules: products.flatMap((p) => (p.pvModuleId ? [p.pvModuleId] : [])),
    inverters: products.flatMap((p) => (p.inverterId ? [p.inverterId] : [])),
  };
}

/**
 * Makes a sponsored installer's panels and inverters exactly what its supplier carries: removes
 * the others from its library and adds the missing ones. Other equipment is untouched. A direct
 * installer (no sponsor) is left alone.
 */
export async function syncSponsoredLibrary(installerCompanyId: string): Promise<void> {
  const company = await db.company.findUnique({ where: { id: installerCompanyId }, select: { sponsorCompanyId: true } });
  if (!company?.sponsorCompanyId) return;
  const { modules, inverters } = await carriedItemIds(company.sponsorCompanyId);
  await db.$transaction([
    db.libraryItem.deleteMany({ where: { companyId: installerCompanyId, kind: 'PV_MODULE', pvModuleId: { notIn: modules } } }),
    db.libraryItem.deleteMany({ where: { companyId: installerCompanyId, kind: 'INVERTER', inverterId: { notIn: inverters } } }),
    db.libraryItem.createMany({ data: modules.map((pvModuleId) => ({ companyId: installerCompanyId, kind: 'PV_MODULE' as const, pvModuleId })), skipDuplicates: true }),
    db.libraryItem.createMany({ data: inverters.map((inverterId) => ({ companyId: installerCompanyId, kind: 'INVERTER' as const, inverterId })), skipDuplicates: true }),
  ]);
}

/** Call after catalog items a supplier may carry were published: every supplier carrying one re-syncs its installers. */
export async function syncSuppliersCarrying(kind: 'PV_MODULE' | 'INVERTER', itemIds: string[] | 'all'): Promise<void> {
  const link = kind === 'PV_MODULE' ? 'pvModuleId' : 'inverterId';
  const products = await db.supplierProduct.findMany({
    where: itemIds === 'all' ? { [link]: { not: null } } : { [link]: { in: itemIds } },
    select: { supplierCompanyId: true },
  });
  for (const supplierId of new Set(products.map((p) => p.supplierCompanyId))) await syncSupplierInstallers(supplierId);
}

/** Call after a supplier's carried products change: every installer it sponsors follows. */
export async function syncSupplierInstallers(supplierId: string): Promise<void> {
  const installers = await db.company.findMany({ where: { sponsorCompanyId: supplierId }, select: { id: true } });
  for (const installer of installers) await syncSponsoredLibrary(installer.id);
}

export interface SeatInfo {
  used: number;
  /** Null: the pack sets no limit (or the supplier has no pack yet: then nothing can be added). */
  max: number | null;
  hasPack: boolean;
}

/** How many installers a supplier sponsors against its pack's limit. */
export async function supplierSeats(supplierId: string): Promise<SeatInfo> {
  const [used, subscription] = await Promise.all([
    db.company.count({ where: { sponsorCompanyId: supplierId } }),
    db.subscription.findUnique({ where: { companyId: supplierId }, include: { plan: true } }),
  ]);
  return { used, max: subscription?.plan.maxSponsoredInstallers ?? null, hasPack: subscription !== null };
}

const FULL_MESSAGE = 'Votre pack est complet : passez à un pack plus grand pour parrainer d’autres installateurs.';

async function assertSeatFree(supplierId: string): Promise<void> {
  const seats = await supplierSeats(supplierId);
  if (!seats.hasPack) throw new SponsorshipError('Ce fournisseur n’a pas de pack actif : impossible de parrainer un installateur.');
  if (seats.max !== null && seats.used >= seats.max) throw new SponsorshipError(FULL_MESSAGE);
}

/**
 * A supplier invites an installer by email. Returns the raw token for the emailed link. Refused
 * when the pack is full or the email already belongs to an installer this supplier sponsors.
 */
export async function createInvitation(supplierId: string, rawEmail: string): Promise<{ token: string; email: string }> {
  const email = normalizeEmail(rawEmail);
  await assertSeatFree(supplierId);
  const existing = await db.companyUser.findUnique({ where: { email }, select: { company: { select: { sponsorCompanyId: true, kind: true } } } });
  if (existing?.company.kind === 'SUPPLIER') throw new SponsorshipError('Cette adresse appartient à un fournisseur.');
  if (existing?.company.sponsorCompanyId === supplierId) throw new SponsorshipError('Cet installateur est déjà parrainé par vous.');
  const token = generateToken();
  // A new invitation replaces this supplier's earlier unused ones for the same address.
  await db.$transaction([
    db.supplierInvitation.deleteMany({ where: { supplierCompanyId: supplierId, email, acceptedAt: null } }),
    db.supplierInvitation.create({ data: { supplierCompanyId: supplierId, email, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + INVITATION_LIFETIME_MS) } }),
  ]);
  return { token, email };
}

export interface ValidInvitation {
  id: string;
  email: string;
  supplierCompanyId: string;
  supplierName: string;
}

/** The invitation behind a link while it can still be used; null otherwise. */
export async function findValidInvitation(rawToken: string): Promise<ValidInvitation | null> {
  const invitation = await db.supplierInvitation.findUnique({ where: { tokenHash: hashToken(rawToken) }, include: { supplierCompany: { select: { name: true } } } });
  if (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date()) return null;
  return { id: invitation.id, email: invitation.email, supplierCompanyId: invitation.supplierCompanyId, supplierName: invitation.supplierCompany.name };
}

/**
 * Puts an installer under a supplier and gives it the supplier's panels and inverters. Refused for
 * a supplier company, an installer already sponsored by another supplier (it must leave first),
 * or a full pack. Idempotent for the same supplier.
 */
export async function linkInstaller(installerCompanyId: string, supplierId: string): Promise<void> {
  const [installer, supplier] = await Promise.all([
    db.company.findUnique({ where: { id: installerCompanyId }, select: { kind: true, sponsorCompanyId: true } }),
    db.company.findUnique({ where: { id: supplierId }, select: { kind: true } }),
  ]);
  if (!installer || installer.kind !== 'INSTALLER') throw new SponsorshipError('Installateur introuvable.');
  if (!supplier || supplier.kind !== 'SUPPLIER') throw new SponsorshipError('Fournisseur introuvable.');
  if (installer.sponsorCompanyId === supplierId) return;
  if (installer.sponsorCompanyId) throw new SponsorshipError('Cet installateur est déjà parrainé par un autre fournisseur : retirez-le d’abord.');
  await assertSeatFree(supplierId);
  await db.company.update({ where: { id: installerCompanyId }, data: { sponsorCompanyId: supplierId } });
  await syncSponsoredLibrary(installerCompanyId);
}

/**
 * Uses an invitation up for this installer, once (a link works one time only), and puts the
 * installer under the supplier. The invitation is CLAIMED first, atomically, so two clicks racing
 * on the same link cannot both link; if linking is then refused (pack full, already sponsored…),
 * the claim is released so the installer can try again after the problem is fixed.
 */
export async function consumeInvitation(invitationId: string, supplierCompanyId: string, installerCompanyId: string): Promise<void> {
  const claimed = await db.supplierInvitation.updateMany({
    where: { id: invitationId, acceptedAt: null, expiresAt: { gt: new Date() } },
    data: { acceptedAt: new Date(), acceptedCompanyId: installerCompanyId },
  });
  if (claimed.count !== 1) throw new SponsorshipError('Cette invitation n’est plus valide.');
  try {
    await linkInstaller(installerCompanyId, supplierCompanyId);
  } catch (error) {
    await db.supplierInvitation.updateMany({ where: { id: invitationId, acceptedCompanyId: installerCompanyId }, data: { acceptedAt: null, acceptedCompanyId: null } });
    throw error;
  }
}

/** An installer accepts an invitation (from the link, signed in as that installer's company). */
export async function acceptInvitation(rawToken: string, installerCompanyId: string): Promise<{ supplierName: string }> {
  const invitation = await findValidInvitation(rawToken);
  if (!invitation) throw new SponsorshipError('Cette invitation n’est plus valide.');
  await consumeInvitation(invitation.id, invitation.supplierCompanyId, installerCompanyId);
  return { supplierName: invitation.supplierName };
}

/**
 * Ends sponsoring: the supplier removes the installer, the admin unlinks it, or the installer
 * pays Premium itself (§5.3). The installer becomes a direct installer: its library keeps what it
 * has (projects stay valid), and it can add any shared item again. Its seat is freed.
 */
export async function unlinkInstaller(installerCompanyId: string, client: Pick<typeof db, 'company' | 'subscription'> = db): Promise<void> {
  const unlinked = await client.company.updateMany({ where: { id: installerCompanyId, sponsorCompanyId: { not: null } }, data: { sponsorCompanyId: null } });
  if ((unlinked?.count ?? 0) > 0) {
    // The SUSPENDED row that only held the 3D option (see extendOption3dUntil) must not outlive the
    // sponsoring: left in place it would show the direct installer as "suspended" and an admin
    // assigning it a plan would change the plan of a row that stays suspended.
    await client.subscription.deleteMany({ where: { companyId: installerCompanyId, status: 'SUSPENDED', option3dUntil: { not: null } } });
  }
}

/** True when the company is limited to a supplier's panels and inverters. */
export async function isSponsored(companyId: string): Promise<boolean> {
  const company = await db.company.findUnique({ where: { id: companyId }, select: { sponsorCompanyId: true } });
  return Boolean(company?.sponsorCompanyId);
}

/**
 * The subscription the company generates dossiers under. A direct installer: its own. A sponsored
 * installer (§5.4): the Standard plan paid by its supplier — active while the supplier's own
 * subscription is — with the pack's per-installer monthly quota, not the supplier's pack figures.
 * Null when there is none.
 */
export async function loadEffectiveSubscription(companyId: string): Promise<(SubscriptionLike & { sponsored: boolean; periodStart: Date; isTrial: boolean; option3dUntil: Date | null }) | null> {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { sponsorCompanyId: true, subscription: { include: { plan: true } } },
  });
  if (!company) return null;
  if (company.sponsorCompanyId) {
    const sponsor = await db.subscription.findUnique({ where: { companyId: company.sponsorCompanyId }, include: { plan: true } });
    if (!sponsor) return null;
    return {
      status: sponsor.status,
      periodStart: sponsor.periodStart,
      periodEnd: sponsor.periodEnd,
      plan: { name: `Standard (offert par votre fournisseur)`, monthlyDossierLimit: sponsor.plan.dossiersPerInstallerPerMonth, tier: 'STANDARD' },
      isTrial: false,
      sponsored: true,
      option3dUntil: company.subscription?.option3dUntil ?? null,
    };
  }
  const own = company.subscription;
  if (!own) return null;
  return {
    status: own.status,
    periodStart: own.periodStart,
    periodEnd: own.periodEnd,
    plan: { name: own.plan.name, monthlyDossierLimit: own.plan.monthlyDossierLimit, tier: own.plan.tier },
    isTrial: own.plan.isTrial,
    sponsored: false,
    option3dUntil: own.option3dUntil,
  };
}

/** Whether a new project of this company gets the 3D view: Premium, or a sponsored Standard that paid the option. */
export function includes3d(subscription: { plan: { tier: 'STANDARD' | 'PREMIUM' }; option3dUntil: Date | null; periodEnd: Date; status: string }, now: Date): boolean {
  if (subscription.plan.tier === 'PREMIUM') return true;
  return subscription.option3dUntil !== null && subscription.option3dUntil > now && subscription.status === 'ACTIVE' && subscription.periodEnd > now;
}

/** Refusals shown to a sponsored installer (they live here: a "use server" file can only export actions). */
export const CATALOG_LOCK_MESSAGE = 'Votre fournisseur impose ses panneaux et onduleurs.';
export const SPONSORED_OWN_EQUIPMENT_MESSAGE = 'Votre fournisseur impose ses panneaux et onduleurs : vous ne pouvez pas ajouter votre propre matériel.';
