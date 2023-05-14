"use client"
import { FC } from 'react';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { transactionsTable } from '../../../database/database.config';
import { ITransaction, TransactionType } from '../../../database/types/types';

type Props = {
    ticker: string
}
const TransactionsList: FC<Props> = ({ticker}: Props) => {    
    const transactions = useLiveQuery<Array<ITransaction>>(
        () => transactionsTable.where("ticker").equals(ticker).toArray(),
        [ticker]
    );
    return <div>
        <h2>Transactions</h2>
        <ul>
        {transactions?.map(transaction => <li key={transaction.id}>
            <Link href={`/stocks/transaction/${transaction.id}`}>
                {new Date(transaction.date).toLocaleDateString()}, 
                {transaction.description}, 
                {(transaction.type.toString() === 'buy') ? '' :' -'}
                {transaction.shares}, 
                {transaction.price},  
                {transaction.brokerage}
                </Link>
        </li>)}
        </ul>
    </div>
}

export default TransactionsList;