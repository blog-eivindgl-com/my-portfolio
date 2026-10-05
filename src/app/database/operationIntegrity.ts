import Dexie, { Table } from 'dexie';
interface Tables { table(name: string): Table }
interface Digest { id: string; sequence: number; digestVersion: 1; contentHash: string; previousHash: string | null; chainHash: string }
const canonical = (value: unknown) => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item);
async function hash(text: string): Promise<string> {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(bytes)).map(value => value.toString(16).padStart(2, '0')).join('');
}
async function digest(operation: { id: string; sequence: number }, previousHash: string | null): Promise<Digest> {
    const contentHash = await hash(canonical(operation));
    return { id: operation.id, sequence: operation.sequence, digestVersion: 1, contentHash, previousHash,
        chainHash: await hash(canonical({ digestVersion: 1, previousHash, contentHash })) };
}
// All callers own a transaction covering outbox and operationDigests as well as
// domain, identity and sequence stores. This is a local per-device chain only.
export async function appendOperation<T extends { id: string; sequence: number }>(db: Tables, operation: T): Promise<void> {
    const previous: Digest | undefined = await db.table('operationDigests').orderBy('sequence').last();
    const row: Digest = await Dexie.waitFor(digest(operation, previous?.chainHash || null));
    await db.table('outbox').add(operation); await db.table('operationDigests').add(row);
}
export async function sealLegacyOperations(db: Tables): Promise<void> {
    const operations = (await db.table('outbox').toArray()).sort((a, b) => a.sequence - b.sequence);
    let previous: string | null = null;
    for (const operation of operations) { const row: Digest = await Dexie.waitFor(digest(operation, previous)); await db.table('operationDigests').add(row); previous = row.chainHash; }
}
export async function verifyOperationDigests(db: Tables, operations: { id: string; sequence: number }[]): Promise<void> {
    const stored: Digest[] = await db.table('operationDigests').toArray();
    if (stored.length !== operations.length) throw new Error('Operation integrity evidence is missing. Records were retained; do not clear storage.');
    const byId = new Map(stored.map(row => [row.id, row])); let previous: string | null = null;
    for (const operation of [...operations].sort((a,b) => a.sequence - b.sequence)) {
        const expected: Digest = await Dexie.waitFor(digest(operation, previous));
        if (canonical(byId.get(operation.id)) !== canonical(expected)) throw new Error('Operation hash/chain integrity check failed. Records were retained; do not clear storage.');
        previous = expected.chainHash;
    }
}
