import Dexie from 'dexie';
import database from '../database/database.config';
import { IStock } from '../database/types/types';
import { isUuid } from './instrumentValidation';
import { InstrumentLookupError } from './InstrumentLookupError';
export async function resolveInstrument(reference: string, db: Dexie = database): Promise<IStock> {
    if (isUuid(reference)) {
        const instrument = await db.table('instruments').get(reference);
        if (instrument) return instrument;
    }
    const matches: IStock[] = await db.table('instruments').where('ticker').equals(reference).toArray();
    if (matches.length !== 1) throw new InstrumentLookupError(matches.length ? 'This ticker identifies multiple instruments. Open an instrument from the list.' : 'This instrument is unavailable. Return to the instrument list.');
    return matches[0];
}
