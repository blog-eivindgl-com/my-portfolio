import type { Table } from 'dexie';
import { DomainRecord, DomainStore, domainStores, domainKey, EntityState, entityKey, LocalState, Operation } from './types/foundation';
import { canonicalRecords, PortfolioRecords, validateIdentity, validateRecords } from '../services/backupFormat';
import { ITransaction } from './types/types';

export class IdentityIntegrityError extends Error {
    constructor(detail: string) { super(`Identity/history integrity check failed: ${detail}. Records were retained. Do not clear browser storage.`); this.name = 'IdentityIntegrityError'; }
}
export interface IdentityIntegrityReport {
    checkVersion: 1; datasetId: string; headRevision: string; operationCount: number;
    liveRecords: number; tombstones: number;
    instruments: { legacyTicker: string; instrumentId: string; transactions: number; prices: number }[];
}
export interface IntegritySnapshot { records: unknown; entities: unknown; localState: unknown; operations: unknown }
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
// Compare native IndexedDB values without JSON's loss of undefined, NaN or -0.
function sameValue(actual: unknown, expected: unknown): boolean {
    if (Object.is(actual, expected)) return true;
    if (!actual || !expected || typeof actual !== 'object' || typeof expected !== 'object') return false;
    if (Array.isArray(actual) !== Array.isArray(expected) || Object.prototype.toString.call(actual) !== Object.prototype.toString.call(expected)) return false;
    if (Array.isArray(actual) && actual.length !== (expected as unknown[]).length) return false;
    const keys = Object.keys(actual), otherKeys = Object.keys(expected);
    return keys.length === otherKeys.length && keys.every(key => Object.prototype.hasOwnProperty.call(expected, key)
        && sameValue((actual as Record<string, unknown>)[key], (expected as Record<string, unknown>)[key]));
}
function requireThat(condition: unknown, detail: string): asserts condition { if (!condition) throw new IdentityIntegrityError(detail); }
function object(value: unknown, fields: string[], path: string): Record<string, any> {
    requireThat(value && typeof value === 'object' && !Array.isArray(value), `${path} is not an object`);
    requireThat(Object.keys(value).length === fields.length && fields.every(field => Object.prototype.hasOwnProperty.call(value, field)), `${path} has unknown or missing fields`);
    return value as Record<string, any>;
}
function equal(actual: unknown, expected: unknown, path: string) { requireThat(sameValue(actual, expected), `${path} disagrees with retained history`); }
function checkedRecords(value: unknown): PortfolioRecords {
    try { return validateRecords(value); } catch { throw new IdentityIntegrityError('unsupported record shape, value or reference'); }
}
function checkedEntities(value: unknown, records: PortfolioRecords, datasetId: string): EntityState[] {
    try {
        const entities = validateIdentity({ datasetId, entities: value }, records).entities;
        requireThat(new Set(entities.map(entity => entity.entityId.toLowerCase())).size === entities.length, 'case-aliased UUID identities are ambiguous');
        return entities;
    } catch (error) { if (error instanceof IdentityIntegrityError) throw error; throw new IdentityIntegrityError('invalid or ambiguous identity mapping'); }
}

// Pure verification of this app's retained LOCAL journal. No remote replay or writes.
// A portable restore starts a new baseline, so evidence before that boundary is not inferred.
export function verifyIdentitySnapshot(input: IntegritySnapshot): IdentityIntegrityReport {
    requireThat(Array.isArray(input.localState) && input.localState.length === 1, 'exactly one local state is required');
    const state = object(input.localState[0], ['id', 'datasetId', 'deviceId', 'nextSequence', 'headRevision'], 'local state') as LocalState;
    requireThat(state.id === 'local' && uuid(state.datasetId) && uuid(state.deviceId) && uuid(state.headRevision)
        && Number.isSafeInteger(state.nextSequence) && state.nextSequence >= 2, 'invalid dataset/device/sequence identity');
    const current = checkedRecords(input.records), currentEntities = checkedEntities(input.entities, current, state.datasetId);
    requireThat(Array.isArray(input.operations) && input.operations.length > 0 && input.operations.length <= 250_000, 'missing history or history exceeds the 250,000-operation verification limit');
    const operationIds = new Set<string>();
    const operations = input.operations.map((value, index) => {
        const row = object(value, ['id', 'operationVersion', 'datasetId', 'deviceId', 'sequence', 'baseRevision', 'createdAt', 'kind', 'entityId', 'payload'], `operation ${index}`);
        requireThat(uuid(row.id) && !operationIds.has(row.id.toLowerCase()), 'invalid or duplicate operation UUID'); operationIds.add(row.id.toLowerCase());
        requireThat(row.datasetId === state.datasetId && row.deviceId === state.deviceId && Number.isSafeInteger(row.sequence) && row.sequence >= 1 && row.sequence < Number.MAX_SAFE_INTEGER, 'operation dataset/device/sequence mismatch');
        requireThat(typeof row.createdAt === 'string' && Number.isFinite(Date.parse(row.createdAt)) && new Date(row.createdAt).toISOString() === row.createdAt, 'invalid operation timestamp');
        return row as Operation;
    }).sort((a, b) => a.sequence - b.sequence);
    requireThat(operations[0].kind === 'baseline', 'history must start with a complete baseline');
    const rows = new Map<DomainStore, Map<string, DomainRecord>>(domainStores.map(store => [store, new Map()]));
    const entities = new Map<string, EntityState>(), reservedIds = new Set<string>();
    const records = (): PortfolioRecords => Object.fromEntries(domainStores.map(store => [store, Array.from(rows.get(store)!.values())])) as unknown as PortfolioRecords;
    function install(store: DomainStore, row: DomainRecord) { rows.get(store)!.set(domainKey(store, row), row); }
    function checkedRecord(store: DomainStore, value: unknown): DomainRecord {
        const candidate = value as ITransaction;
        const accounts = store === 'transactions' ? [rows.get('accounts')!.get(candidate?.accountId)].filter(Boolean) : [];
        const stocks = store === 'transactions' ? [rows.get('stocks')!.get(candidate?.ticker)].filter(Boolean) : [];
        const subset = checkedRecords({ accounts, stocks, transactions: [], stockPrices: [], [store]: [value] });
        return subset[store][0];
    }
    for (let index = 0; index < operations.length; index++) {
        const operation = operations[index];
        if (index) requireThat(operation.sequence === operations[index - 1].sequence + 1, 'operation sequence has a gap or duplicate');
        if (operation.kind === 'baseline') {
            requireThat(index === 0 && operation.entityId === null && operation.baseRevision === null && [1, 2].includes(operation.operationVersion), 'unsupported or misplaced baseline');
            const payload = object(operation.payload, ['records', 'entities'], 'baseline payload');
            const baseline = checkedRecords(payload.records), identities = checkedEntities(payload.entities, baseline, state.datasetId);
            requireThat(operation.operationVersion !== 1 || identities.every(entity => !entity.deleted), 'version-1 baseline cannot contain deletion markers');
            for (const entity of identities) {
                requireThat(entity.revision === operation.id, 'baseline entity revision mismatch');
                entities.set(entity.key, entity); reservedIds.add(entity.entityId.toLowerCase());
            }
            for (const store of domainStores) for (const row of baseline[store]) install(store, row);
            continue;
        }
        requireThat(uuid(operation.entityId), 'invalid operation entity UUID');
        if (operation.kind === 'create') {
            requireThat(operation.operationVersion === 1 && operation.baseRevision === null, 'unsupported create operation version/revision');
            const payload = object(operation.payload, ['store', 'record', 'entity', 'references'], 'create payload');
            requireThat(['accounts', 'stocks', 'transactions'].includes(payload.store), 'unsupported create store');
            const store = payload.store as DomainStore, row = checkedRecord(store, payload.record), key = domainKey(store, row);
            requireThat(!entities.has(entityKey(store, key)) && !reservedIds.has(operation.entityId.toLowerCase()), 'create reuses a reserved record or UUID identity');
            const expected: EntityState = { key: entityKey(store, key), store, recordKey: key, entityId: operation.entityId, revision: operation.id, deleted: false, tradeOrder: null, currency: null, instrumentKind: null };
            equal(payload.entity, expected, 'created entity');
            const trade = row as ITransaction;
            equal(payload.references, store === 'transactions' ? {
                accountId: entities.get(entityKey('accounts', trade.accountId))?.entityId,
                instrumentId: entities.get(entityKey('stocks', trade.ticker))?.entityId,
            } : {}, 'canonical account/instrument references');
            install(store, row); entities.set(expected.key, expected); reservedIds.add(operation.entityId.toLowerCase());
            continue;
        }
        requireThat(operation.kind === 'update' || operation.kind === 'delete' || operation.kind === 'rename', 'unknown operation kind/version');
        const payload = object(operation.payload, ['command', 'before', 'after', 'entity'], 'change payload');
        const isRename = operation.kind === 'rename';
        requireThat(operation.operationVersion === (isRename ? 3 : 2), 'unsupported change operation version');
        const command = object(payload.command, ['commandId', 'datasetId', 'entityId', 'expectedRevision', 'kind',
            ...(isRename ? ['recordKey', 'store', 'name'] : ['transactionId']), ...(operation.kind === 'update' ? ['record'] : [])], 'change command');
        requireThat(command.commandId === operation.id && command.datasetId === state.datasetId && command.entityId === operation.entityId
            && command.expectedRevision === operation.baseRevision && command.kind === operation.kind, 'command and operation disagree');
        const store: DomainStore = isRename ? command.store : 'transactions', key = isRename ? command.recordKey : command.transactionId;
        requireThat((!isRename || store === 'accounts' || store === 'stocks') && typeof key === 'string', 'invalid change target');
        const entity = entities.get(entityKey(store, key)), before = rows.get(store)!.get(key);
        requireThat(entity && before && !entity.deleted && entity.entityId === operation.entityId && entity.revision === operation.baseRevision, 'stale or missing change base identity/revision');
        equal(payload.before, before, 'before record');
        const next = { ...entity, revision: operation.id, deleted: operation.kind === 'delete' };
        equal(payload.entity, next, 'changed entity');
        if (operation.kind === 'delete') {
            requireThat(payload.after === null, 'deleted record must have a null after value'); rows.get(store)!.delete(key);
        } else {
            const after = checkedRecord(store, payload.after);
            if (isRename) {
                requireThat(typeof command.name === 'string' && !!command.name.trim(), 'invalid renamed name');
                equal(after, { ...before, name: command.name }, 'renamed record');
            } else {
                equal(payload.after, command.record, 'updated command record');
                const oldTrade = before as ITransaction, newTrade = after as ITransaction;
                requireThat(newTrade.id === oldTrade.id && newTrade.accountId === oldTrade.accountId && newTrade.ticker === oldTrade.ticker, 'transaction identity/reference reassignment');
            }
            install(store, after);
        }
        entities.set(next.key, next);
    }
    const last = operations[operations.length - 1];
    requireThat(state.nextSequence === last.sequence + 1 && state.headRevision === last.id, 'local head/next sequence disagrees with history');
    requireThat(canonicalRecords(records()) === canonicalRecords(current), 'current records disagree with history');
    const sortedEntities = (items: EntityState[]) => [...items].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
    equal(sortedEntities(Array.from(entities.values())), sortedEntities(currentEntities), 'current identity/revision/deletion state');
    const transactionCounts = new Map<string, number>(), priceCounts = new Map<string, number>();
    for (const trade of current.transactions) transactionCounts.set(trade.ticker, (transactionCounts.get(trade.ticker) || 0) + 1);
    for (const price of current.stockPrices) priceCounts.set(price.ticker, (priceCounts.get(price.ticker) || 0) + 1);
    return { checkVersion: 1, datasetId: state.datasetId, headRevision: state.headRevision, operationCount: operations.length,
        liveRecords: domainStores.reduce((count, store) => count + current[store].length, 0), tombstones: currentEntities.filter(entity => entity.deleted).length,
        instruments: current.stocks.map(stock => ({ legacyTicker: stock.ticker, instrumentId: entities.get(entityKey('stocks', stock.ticker))!.entityId,
            transactions: (transactionCounts.get(stock.ticker) || 0), prices: (priceCounts.get(stock.ticker) || 0) })) };
}

// Caller supplies a single transaction spanning all seven stores; no split snapshots.
export async function inspectIdentityIntegrity(db: { table(name: string): Table }): Promise<IdentityIntegrityReport> {
    const [accounts, stocks, transactions, stockPrices, localState, entities, operations] = await Promise.all(
        ['accounts', 'stocks', 'transactions', 'stockPrices', 'localState', 'entityStates', 'outbox'].map(store => db.table(store).toArray()));
    return verifyIdentitySnapshot({ records: { accounts, stocks, transactions, stockPrices }, localState, entities, operations });
}
