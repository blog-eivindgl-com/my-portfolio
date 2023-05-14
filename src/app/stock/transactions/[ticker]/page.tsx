"use client"
import Link from 'next/link';
import { Container } from '@nextui-org/react';
import TransactionsList from './TransactionsList';
import { stockTable } from '../../../database/database.config';
import { useLiveQuery } from 'dexie-react-hooks';
import { IStock } from '../../../database/types/types';

function Transactions({params}: {params: { ticker: string}}) {
    const {ticker} = params;
    const stock: IStock | undefined = useLiveQuery(
        () => stockTable.where("ticker").equalsIgnoreCase(ticker).first(),
        [ticker]
    );
    return (
    <Container>
        <h1>{ticker} - {stock?.name}</h1>
        <Link href={`/transactions/${ticker}/create`}>Create transaction</Link>
        <TransactionsList ticker={ticker} />
    </Container>
    );
}

export default Transactions;