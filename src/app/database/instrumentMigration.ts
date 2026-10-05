import { validateRecords, validateIdentity, PortfolioRecords as LegacyRecords } from '../legacy/services/backupFormat';
import { EntityState as LegacyEntity } from '../legacy/database/types/foundation';
import { PortfolioRecords } from '../services/backupFormat';
import { EntityState, entityKey } from './types/foundation';

export function convertLegacySnapshot(recordsValue: unknown, entitiesValue: unknown, datasetId: string): { records: PortfolioRecords; entities: EntityState[] } {
    const old: LegacyRecords = validateRecords(recordsValue);
    const identities: LegacyEntity[] = validateIdentity({ datasetId, entities: entitiesValue }, old).entities;
    const ids = new Map(identities.filter(e => e.store === 'stocks').map(e => [e.recordKey, e.entityId]));
    function instrumentId(ticker: string): string {
        const id = ids.get(ticker); if (!id) throw new Error('Unmapped historical instrument. Records were retained.'); return id;
    }
    return {
        records: {
            accounts: old.accounts,
            instruments: old.stocks.map(row => ({ id: instrumentId(row.ticker), ticker: row.ticker, name: row.name, currency: null, instrumentKind: null, exchange: null, isin: null })),
            transactions: old.transactions.map(({ ticker, ...row }) => ({ ...row, instrumentId: instrumentId(ticker) })),
            stockPrices: old.stockPrices.map(({ ticker, ...row }) => ({ ...row, instrumentId: instrumentId(ticker) })),
        },
        entities: identities.map(row => row.store === 'stocks' ? { ...row, store: 'instruments', recordKey: row.entityId, key: entityKey('instruments', row.entityId) } : { ...row, store: row.store as EntityState['store'] }),
    };
}
