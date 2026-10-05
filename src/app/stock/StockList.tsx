import { FC } from 'react';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { stockTable } from '../database/database.config';
import { useState } from 'react';
import { Container } from '@nextui-org/react'

const StocksList: FC = () => {
    const [ticker, setTicker] = useState('');
    const [name, setName] = useState('');
    const stock = useLiveQuery(
        () => stockTable.where("name").startsWithIgnoreCase(name).toArray(),
        [name]
    );
    return (
        <Container>
        <h2>Stock</h2>
        name: <input title="Search" type="text" value={name} onChange={(e) => setName(e.target.value)} />
        <ul>
        {stock?.map(stock => <li key={stock.id}>
            <Link href={`/stock/transactions/${encodeURIComponent(stock.id)}`}>{stock.name}</Link>{' '}{stock.ticker || 'No ticker'} · {stock.instrumentKind || 'Unknown kind'} · {stock.currency || 'Unknown currency'}{' '}
            <a href={`/stock/edit/${encodeURIComponent(stock.id)}`} aria-label={`Edit name for ${stock.name}`}>Edit name</a>
        </li>)}
        </ul>
        </Container>
    );
}

export default StocksList;
