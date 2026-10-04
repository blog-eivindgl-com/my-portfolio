import { FC, useRef, useState } from 'react';
import PortfolioRepository from '../../services/PortfolioRepository';
import { Container } from '@nextui-org/react';

const StockForm: FC = () => {
    const saving = useRef(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const createStock = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (saving.current) return;
        const form = event.currentTarget, data = new FormData(form);
        saving.current = true; setBusy(true); setError('');
        try {
            await new PortfolioRepository().createInstrument({ ticker: String(data.get('ticker') || ''), name: String(data.get('name') || '') });
            form.reset();
        } catch { setError('Instrument was not saved. Check the ticker/name for a conflicting existing record, or retry after a storage failure.'); }
        finally { saving.current = false; setBusy(false); }
    };
    return <Container><h1>Create stock</h1><form onSubmit={createStock}>
        <fieldset disabled={busy}>
            <label htmlFor="ticker">Ticker:</label><br />
            <input type="text" id="ticker" name="ticker" required /><br /><br />
            <label htmlFor="name">Name:</label><br />
            <input type="text" id="name" name="name" required /><br /><br />
            <button type="submit">{busy ? 'Saving...' : 'Create'}</button>
        </fieldset>
        {error && <p role="alert">{error}</p>}
    </form></Container>;
};
export default StockForm;
