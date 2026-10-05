import type { HistoricalSource } from '../historicalMigration';
import type { PortfolioRecords } from '../../services/backupFormat';
import { IAccount, IStock, IStockPrice, ITransaction } from './types';

export const domainStores = ['accounts', 'instruments', 'transactions', 'stockPrices'] as const;
export type DomainStore = typeof domainStores[number];
export type DomainRecord = IAccount | IStock | IStockPrice | ITransaction;
export interface EntityState {
    key: string;
    store: DomainStore;
    recordKey: string;
    entityId: string;
    revision: string;
    deleted: boolean; // Only transaction deletion is supported.
    tradeOrder: null; // Never infer trade order from a device sequence.
    currency: null;
    instrumentKind: null;
}
export interface IdentitySnapshot { datasetId: string; entities: EntityState[] }
export interface LocalState {
    id: 'local'; datasetId: string; deviceId: string; nextSequence: number; headRevision: string;
}
interface OperationHeader {
    id: string; operationVersion: 4; datasetId: string; deviceId: string; sequence: number;
    baseRevision: string | null; createdAt: string;
}
export interface TransactionTarget {
    commandId: string; datasetId: string; entityId: string; transactionId: string; expectedRevision: string;
}
export type TransactionCommand = (TransactionTarget & { kind: 'update'; record: ITransaction }) | (TransactionTarget & { kind: 'delete' });
export interface TransactionSnapshot { datasetId: string; entity: EntityState; record: ITransaction }
export type NameStore = 'accounts' | 'instruments';
export interface NameTarget {
    commandId: string; datasetId: string; entityId: string; recordKey: string; expectedRevision: string;
}
export type RenameCommand = NameTarget & { kind: 'rename'; store: NameStore; name: string };
export interface NamedEntitySnapshot { datasetId: string; entity: EntityState; record: IAccount | IStock }
export type Operation = OperationHeader & (
    { kind: 'migration'; entityId: null; payload: { fromSchema: 3; toSchema: 4; before: { records: unknown; entities: unknown }; after: { records: PortfolioRecords; entities: EntityState[] } } }
    | { kind: 'create'; entityId: string; payload: { store: DomainStore; record: DomainRecord; entity: EntityState; references: { accountId?: string; instrumentId?: string } } }
    | { kind: 'baseline'; entityId: null; payload: { records: PortfolioRecords; entities: EntityState[]; sourceMigration?: HistoricalSource } }
    | { kind: 'update' | 'delete'; operationVersion: 4; entityId: string;
        payload: { command: TransactionCommand; before: ITransaction; after: ITransaction | null; entity: EntityState } }
    | { kind: 'rename'; operationVersion: 4; entityId: string;
        payload: { command: RenameCommand; before: IAccount | IStock; after: IAccount | IStock; entity: EntityState } }
);
export const foundationStores = ['localState', 'entityStates', 'outbox', 'operationDigests'] as const;
export const allStores = [...domainStores, ...foundationStores];
export const entityKey = (store: DomainStore, key: string) => JSON.stringify([store, key]);
export const domainKey = (store: DomainStore, row: DomainRecord): string => row.id;
export const newId = () => crypto.randomUUID();
export function newEntity(store: DomainStore, recordKey: string, revision: string, entityId = newId()): EntityState {
    return { key: entityKey(store, recordKey), store, recordKey, entityId, revision, deleted: false, tradeOrder: null, currency: null, instrumentKind: null };
}
