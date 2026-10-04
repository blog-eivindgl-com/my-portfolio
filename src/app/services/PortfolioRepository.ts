import Dexie from 'dexie';
import database from '../database/database.config';
import { IAccount, IStock, ITransaction } from '../database/types/types';
import { allStores, DomainStore, domainKey, entityKey, LocalState, newEntity, newId, Operation } from '../database/types/foundation';
import { validateTransaction, TransactionValidationError } from './transactionValidation';

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
