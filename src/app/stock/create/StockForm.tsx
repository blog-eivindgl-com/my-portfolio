import { FC, useRef, useState } from 'react';
import PortfolioRepository from '../../services/PortfolioRepository';
import { IStock } from '../../database/types/types';
import { Container } from '@nextui-org/react';
const StockForm: FC = () => {
    const saving = useRef(false), attempt = useRef<string>();
    const [busy, setBusy] = useState(false), [saved, setSaved] = useState(false), [error, setError] = useState('');
    const createStock = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault(); if (saving.current || saved) return;
        const data = new FormData(event.currentTarget), optional = (key: string) => String(data.get(key) || '') || null;
        saving.current = true; setBusy(true); setError('');
        try {
            attempt.current ??= crypto.randomUUID();
            await new PortfolioRepository().createInstrument({ id: attempt.current, name: String(data.get('name') || ''), ticker: optional('ticker'), instrumentKind: optional('instrumentKind') as IStock['instrumentKind'], currency: optional('currency'), exchange: optional('exchange'), isin: optional('isin') });
            setSaved(true);
        } catch (error) { setError(error instanceof Error ? error.message : 'Instrument was not saved. Your entries are retained for retry.'); }
        finally { saving.current = false; setBusy(false); }
    };
    return <Container><h1>Create instrument</h1><form onSubmit={createStock} onChange={() => { if (!saving.current && !saved) { attempt.current = undefined; setError(''); } }}>
        <fieldset disabled={busy || saved}>
            <label htmlFor="name">Name:</label><input id="name" name="name" required /><br />
            <label htmlFor="ticker">Ticker (optional):</label><input id="ticker" name="ticker" /><br />
            <label htmlFor="instrumentKind">Instrument kind:</label><select id="instrumentKind" name="instrumentKind"><option value="">Unknown</option><option value="share">Share</option><option value="fund">Fund</option></select><br />
            <label htmlFor="currency">Currency code (optional):</label><input id="currency" name="currency" pattern="[A-Z]{3}" maxLength={3} placeholder="NOK" /><br />
            <label htmlFor="exchange">Exchange (optional):</label><input id="exchange" name="exchange" /><br />
            <label htmlFor="isin">ISIN (optional):</label><input id="isin" name="isin" pattern="[A-Z]{2}[A-Z0-9]{9}[0-9]" /><br />
            <button type="submit">{busy ? 'Saving...' : 'Create'}</button>
        </fieldset>
        <p>Leave unknown metadata blank. Tickers and names do not identify or merge instruments.</p>
        {saved && <p role="status">Instrument saved. <a href="/stock">Back to instruments</a></p>}
        {error && <p role="alert">{error}</p>}
    </form></Container>;
};
export default StockForm;
