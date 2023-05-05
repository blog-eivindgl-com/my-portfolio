import { FC } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { accountsTable } from '../database/database.config';
import { useState } from 'react';

const AccountsList: FC = () => {
    const [name, setName] = useState('');
    const account = useLiveQuery(
        () => accountsTable.where("name").startsWithIgnoreCase(name).toArray(),
        [name]
    );
    return <div>
        <h2>Accounts</h2>
        name: <input title="Search" type="text" value={name} onChange={(e) => setName(e.target.value)} />
        <ul>
        {account?.map(account => <li key={account.id}>
            {account.name}
        </li>)}
        </ul>
    </div>
}

export default AccountsList;