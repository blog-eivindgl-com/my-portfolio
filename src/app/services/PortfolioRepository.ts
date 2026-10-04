import Dexie from 'dexie';
import database from '../database/database.config';
import { IAccount, IStock, ITransaction } from '../database/types/types';
import { allStores, DomainStore, domainKey, entityKey, LocalState, newEntity, newId, Operation, TransactionCommand, TransactionSnapshot, TransactionTarget, EntityState } from '../database/types/foundation';
import { validateTransaction, TransactionValidationError } from './transactionValidation';

export class TransactionConflictError extends Error {
    constructor(message = 'This transaction changed in another tab. Reload the latest record before trying again.') { super(message); this.name = 'TransactionConflictError'; }
}
const canonical = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);

export default class PortfolioRepository {
    constructor(private readonly db: Dexie = database) {}
    async createAccount(account: IAccount): Promise<void> {
        if (!account || typeof account.id !== 'string' || !account.id.trim() || typeof account.name !== 'string' || !account.name.trim()) throw new Error('Enter an account name and save identity.');
        return this.create('accounts', { id: account.id, name: account.name });
    }
    async createInstrument(stock: IStock): Promise<void> {
        if (!stock || typeof stock.ticker !== 'string' || !stock.ticker.trim() || typeof stock.name !== 'string' || !stock.name.trim()) throw new Error('Enter an instrument ticker and name.');
        return this.create('stocks', { ticker: stock.ticker, name: stock.name });
    }
    async createTransaction(value: unknown): Promise<void> { return this.create('transactions', validateTransaction(value)); }
    async getTransaction(id: string): Promise<TransactionSnapshot> {
        return this.db.transaction('r', allStores, async () => {
            const state: LocalState = await this.db.table('localState').get('local');
            const entity: EntityState = await this.db.table('entityStates').get(entityKey('transactions', id));
            const record: ITransaction = await this.db.table('transactions').get(id);
            if (!entity || entity.deleted || !record) throw new TransactionConflictError('This transaction was deleted or is unavailable. Return to the transaction list.');
            if (!state) throw new Error('Missing dataset metadata.');
            return { datasetId: state.datasetId, entity, record };
        });
    }
    async updateTransaction(target: TransactionTarget, value: unknown): Promise<EntityState> {
        const record = validateTransaction(value);
        // A date/price correction must not silently normalize an imported description.
        record.description = (value as ITransaction).description;
        return this.changeTransaction({ ...target, kind: 'update', record });
    }
    async deleteTransaction(target: TransactionTarget): Promise<EntityState> {
        return this.changeTransaction({ ...target, kind: 'delete' });
    }
    private async changeTransaction(input: TransactionCommand): Promise<EntityState> {
        // Copy only the command contract; callers cannot smuggle arbitrary fields into history.
        const { commandId, datasetId, entityId, transactionId, expectedRevision } = input;
        if (![commandId, datasetId, entityId, expectedRevision].every(value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
            || typeof transactionId !== 'string' || !transactionId.trim()) throw new Error('Invalid transaction command identity.');
        const target = { commandId, datasetId, entityId, transactionId, expectedRevision };
        const command: TransactionCommand = input.kind === 'update' ? { ...target, kind: 'update', record: input.record } : { ...target, kind: 'delete' };
        return this.db.transaction('rw', allStores, async () => {
            const state: LocalState = await this.db.table('localState').get('local');
            if (!state || state.datasetId !== datasetId) throw new TransactionConflictError('The portfolio was restored or replaced. Reload before changing this transaction.');
            // Receipts are checked before current revision: a retry must stay harmless even after a later edit/delete.
            const receipt: Operation | undefined = await this.db.table('outbox').get(commandId);
            if (receipt) {
                if ((receipt.kind === 'update' || receipt.kind === 'delete') && canonical(receipt.payload.command) === canonical(command)) return receipt.payload.entity;
                throw new Error('This command ID already belongs to another change. Reload before trying again.');
            }
            const key = entityKey('transactions', transactionId);
            const entity: EntityState | undefined = await this.db.table('entityStates').get(key);
            const before: ITransaction | undefined = await this.db.table('transactions').get(transactionId);
            if (!entity || entity.entityId !== entityId || entity.revision !== expectedRevision || entity.deleted || !before) throw new TransactionConflictError();
            const after = command.kind === 'update' ? command.record : null;
            if (after && (after.id !== before.id || after.accountId !== before.accountId || after.ticker !== before.ticker)) throw new Error('Transaction identity, account and instrument cannot be changed.');
            if (!await this.db.table('accounts').get(before.accountId) || !await this.db.table('stocks').get(before.ticker)) throw new Error('Missing account or instrument. No changes were saved.');
            const sequence = state.nextSequence;
            if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence >= Number.MAX_SAFE_INTEGER) throw new Error('Invalid or exhausted device sequence.');
            const next = { ...entity, revision: commandId, deleted: command.kind === 'delete' };
            const operation: Operation = { id: commandId, operationVersion: 2, datasetId, deviceId: state.deviceId, sequence,
                kind: command.kind, entityId, baseRevision: expectedRevision, createdAt: new Date().toISOString(), payload: { command, before, after, entity: next } };
            if (after) await this.db.table('transactions').put(after);
            else await this.db.table('transactions').delete(transactionId);
            await this.db.table('entityStates').put(next);
            await this.db.table('outbox').add(operation);
            await this.db.table('localState').put({ ...state, nextSequence: sequence + 1, headRevision: commandId });
            return next;
        });
    }
    private async create(store: DomainStore, row: IAccount | IStock | ITransaction): Promise<void> {
        await this.db.transaction('rw', allStores, async () => {
            const state: LocalState = await this.db.table('localState').get('local');
            if (!state) throw new Error('Missing dataset metadata. No record was saved.');
            const references: { accountId?: string; instrumentId?: string } = {};
            if (store === 'transactions') {
                const trade = row as ITransaction;
                if (!await this.db.table('accounts').get(trade.accountId)) throw new TransactionValidationError({ accountId: 'This account no longer exists. Select an available account.' });
                if (!await this.db.table('stocks').get(trade.ticker)) throw new TransactionValidationError({ ticker: 'This instrument no longer exists. Return to the instrument list.' });
                const account = await this.db.table('entityStates').get(entityKey('accounts', trade.accountId));
                const instrument = await this.db.table('entityStates').get(entityKey('stocks', trade.ticker));
                if (!account || !instrument) throw new Error('Missing reference identity metadata. Retain records for reviewed recovery.');
                references.accountId = account.entityId;
                references.instrumentId = instrument.entityId;
            }
            const key = domainKey(store, row);
            const existing = await this.db.table(store).get(key);
            if (existing) {
                if (!await this.db.table('entityStates').get(entityKey(store, key))) throw new Error('Missing entity metadata; record was not changed.');
                if (Object.keys(existing).length === Object.keys(row).length && Object.keys(row).every(field => existing[field] === (row as Record<string, unknown>)[field])) return;
                throw new TransactionValidationError({ form: 'This save ID already belongs to another record. Start a new entry.' });
            }
            if (await this.db.table('entityStates').get(entityKey(store, key))) throw new Error('Identity already reserved; review this record.');
            const id = newId(), sequence = state.nextSequence;
            if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence >= Number.MAX_SAFE_INTEGER) throw new Error('Invalid or exhausted device sequence.');
            const entity = newEntity(store, key, id);
            const operation: Operation = { id, operationVersion: 1, datasetId: state.datasetId, deviceId: state.deviceId, sequence,
                kind: 'create', entityId: entity.entityId, baseRevision: null, createdAt: new Date().toISOString(), payload: { store, record: row, entity, references } };
            await this.db.table(store).add(row);
            await this.db.table('entityStates').add(entity);
            await this.db.table('outbox').add(operation);
            await this.db.table('localState').put({ ...state, nextSequence: sequence + 1, headRevision: id });
        });
    }
}
