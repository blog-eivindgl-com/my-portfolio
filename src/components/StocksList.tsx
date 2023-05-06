import { FC } from 'react';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { stocksTable } from '../database/database.config';
import { useState } from 'react';
import next from 'next/types';

const StocksList: FC = () => {
    const [ticker, setTicker] = useState('');
    const [name, setName] = useState('');
    const stock = useLiveQuery(
        () => stocksTable.where("name").startsWithIgnoreCase(name).toArray(),
        [name]
    );
    return <div>
        <h2>Stocks</h2>
        name: <input title="Search" type="text" value={name} onChange={(e) => setName(e.target.value)} />
        <ul>
        {stock?.map(stock => <li key={stock.ticker}>
            <Link href={{
                pathname: "/stocks/transactions",
                query: { ticker: stock.ticker}
            }}>{stock.name}</Link>
        </li>)}
        </ul>
    </div>
}

export default StocksList;