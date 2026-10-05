"use client"
import Link from 'next/link';
import { resolveInstrument } from '@/app/services/instrumentLookup';
import { Container } from '@nextui-org/react';
import TransactionsList from './TransactionsList';

import { useLiveQuery } from 'dexie-react-hooks';
import { IPriceList, IStock, ITransaction } from '../../../database/types/types';
import MyNavbar from '@/app/components/NavbarComponent';
import DbService from '@/app/services/DbService';
import PriceListService from '@/app/services/PriceListService';
import TransactionService from '@/app/services/TransactionService';
import TransactionListViewModel from '@/app/viewmodel/transactions/TransactionListViewModel';
import TransactionsSummaryViewModel from '@/app/viewmodel/transactions/TransactionsSummaryViewModel';
import Summary from './Summary';

function Transactions({params}: {params: { ticker: string }}) {
    const {ticker} = params;
    const stock: IStock | undefined = useLiveQuery(
        () => resolveInstrument(ticker).catch(() => undefined),
        [ticker]
    );
    const dbService = new DbService();
    const transactions = useLiveQuery<Array<ITransaction>>(
        () => stock ? dbService.getTransactionsForTicker(stock.id) : Promise.resolve([]),
        [ticker, stock?.id]
    );
    const priceListService = new PriceListService(dbService);
    const transactionService = new TransactionService(priceListService);
    const priceList = useLiveQuery<IPriceList | undefined>(
        () => stock ? priceListService.getPriceListForStock(stock.id) : Promise.resolve(undefined),
        [ticker, stock?.id]
    );
    const transactionListViewModel: TransactionListViewModel = transactionService.getTransactionListViewModel(transactions, priceList);
    const transactionsSummaryViewModel: TransactionsSummaryViewModel = transactionService.getTransactionsSummaryViewModel(transactionListViewModel, priceList);
    return (
    <Container>
        <MyNavbar />
        <h1>{stock?.ticker || 'Instrument'} - {stock?.name}</h1>
        {!stock && <p role="alert">Instrument unavailable or ticker ambiguous. Open an instrument from the list.</p>}
        {stock && <Link href={`/stock/transactions/${stock.id}/create`}>Create transaction</Link>}
        <Summary vm={transactionsSummaryViewModel} />
        <TransactionsList vm={transactionListViewModel} /> 
    </Container>
    );
}

export default Transactions;
