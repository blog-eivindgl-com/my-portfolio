import { FC, useRef, useState } from 'react';
import PortfolioRepository from '../../services/PortfolioRepository';
import { Container } from '@nextui-org/react';

const AccountForm: FC = () => {
    const saveId = useRef<string>();
    const saving = useRef(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const createAccount = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (saving.current) return;
        const form = event.currentTarget;
        saveId.current ||= crypto.randomUUID();
        saving.current = true; setBusy(true); setError('');
        try {
            await new PortfolioRepository().createAccount({ id: saveId.current, name: String(new FormData(form).get('name') || '') });
            form.reset(); saveId.current = undefined;
        } catch { setError('Account was not saved. Check the name and browser storage, then retry.'); }
        finally { saving.current = false; setBusy(false); }
    };
    return <Container><h1>Create account</h1><form onSubmit={createAccount}>
        <fieldset disabled={busy}>
            <label htmlFor="name">Name:</label><br />
            <input type="text" id="name" name="name" required onChange={() => { saveId.current = undefined; }} /><br /><br />
            <button type="submit">{busy ? 'Saving...' : 'Create'}</button>
        </fieldset>
        {error && <p role="alert">{error}</p>}
    </form></Container>;
};
export default AccountForm;
