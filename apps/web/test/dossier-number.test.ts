// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { assignDossierNumber, formatDossierNumber } from '../lib/dossier-number';

describe('formatDossierNumber', () => {
  it('joins the prefix and the number like the reference', () => {
    expect(formatDossierNumber('434', 303)).toBe('434 - 303');
  });

  it('prints the number alone without a prefix', () => {
    expect(formatDossierNumber(null, 303)).toBe('303');
    expect(formatDossierNumber('', 303)).toBe('303');
    expect(formatDossierNumber('  ', 7)).toBe('7');
  });
});

/**
 * Runs against the local development database only — always this explicit URL, never the
 * DATABASE_URL from .env (which points at the production tunnel). Skipped when it is down.
 */
const DEV_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/dossipv_dev';
const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: DEV_DATABASE_URL }) });
const devDatabaseUp = await client.$queryRaw`SELECT 1`.then(
  () => true,
  () => false,
);

describe.skipIf(!devDatabaseUp)('assignDossierNumber (dev database)', () => {
  async function createCompany(): Promise<string> {
    const company = await client.company.create({
      data: {
        name: 'TEST NUMBERING SARL',
        address: '1 rue du Test',
        phone: '70000000',
        email: 'numbering@test.invalid',
        legalRepFullName: 'MR TEST GERANT',
        anmeCode: 'ANME-TEST-01',
        anmeCategory: 'BT',
        anmeValidFrom: new Date('2026-01-01'),
        anmeValidTo: new Date('2028-01-01'),
        dossierPrefix: '434',
        dossierCounter: 302,
      },
    });
    return company.id;
  }

  async function createProject(companyId: string): Promise<string> {
    return (await client.project.create({ data: { companyId } })).id;
  }

  async function counterOf(companyId: string): Promise<number> {
    return (await client.company.findUniqueOrThrow({ where: { id: companyId } })).dossierCounter;
  }

  afterAll(async () => {
    await client.project.deleteMany({ where: { company: { name: 'TEST NUMBERING SARL' } } });
    await client.company.deleteMany({ where: { name: 'TEST NUMBERING SARL' } });
    await client.$disconnect();
  });

  it("increments the counter exactly once on a project's first generation and stores the number", async () => {
    const companyId = await createCompany();
    const projectId = await createProject(companyId);

    const number = await client.$transaction((tx) => assignDossierNumber(tx, companyId, projectId));

    expect(number).toBe('434 - 303');
    expect(await counterOf(companyId)).toBe(303);
    expect((await client.project.findUniqueOrThrow({ where: { id: projectId } })).dossierNumber).toBe('434 - 303');
  });

  it('a regeneration keeps the number and does not increment the counter', async () => {
    const companyId = await createCompany();
    const projectId = await createProject(companyId);
    await client.$transaction((tx) => assignDossierNumber(tx, companyId, projectId));

    const again = await client.$transaction((tx) => assignDossierNumber(tx, companyId, projectId));

    expect(again).toBe('434 - 303');
    expect(await counterOf(companyId)).toBe(303);
  });

  it('two concurrent first generations get different numbers', async () => {
    const companyId = await createCompany();
    const [first, second] = [await createProject(companyId), await createProject(companyId)];

    const numbers = await Promise.all([
      client.$transaction((tx) => assignDossierNumber(tx, companyId, first)),
      client.$transaction((tx) => assignDossierNumber(tx, companyId, second)),
    ]);

    expect(new Set(numbers)).toEqual(new Set(['434 - 303', '434 - 304']));
    expect(await counterOf(companyId)).toBe(304);
  });

  it('two concurrent first generations of the same project take one number', async () => {
    const companyId = await createCompany();
    const projectId = await createProject(companyId);

    const numbers = await Promise.all([
      client.$transaction((tx) => assignDossierNumber(tx, companyId, projectId)),
      client.$transaction((tx) => assignDossierNumber(tx, companyId, projectId)),
    ]);

    expect(numbers).toEqual(['434 - 303', '434 - 303']);
    expect(await counterOf(companyId)).toBe(303);
  });

  it('refuses a project of another company', async () => {
    const companyId = await createCompany();
    const otherCompanyId = await createCompany();
    const projectId = await createProject(otherCompanyId);

    await expect(client.$transaction((tx) => assignDossierNumber(tx, companyId, projectId))).rejects.toThrow('not found');
    expect(await counterOf(companyId)).toBe(302);
  });
});
