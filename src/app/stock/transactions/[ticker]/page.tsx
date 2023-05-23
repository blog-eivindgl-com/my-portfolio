"use client"
import Link from 'next/link';
import { Container, Text } from '@nextui-org/react';
import TransactionsList from './TransactionsList';
import { stockTable } from '../../../database/database.config';
import { useLiveQuery } from 'dexie-react-hooks';
import { IPriceList, IStock, ITransaction } from '../../../database/types/types';
import MyNavbar from '@/app/components/NavbarComponent';
import DbService from '@/app/services/DbService';
import PriceListService from '@/app/services/PriceListService';
import TransactionService from '@/app/services/TransactionService';
import TransactionListViewModel from '@/app/viewmodel/transactions/TransactionListViewModel';
import TransactionsSummaryViewModel from '@/app/viewmodel/transactions/TransactionsSummaryViewModel';
import Summary from './Summary';

export async function generateStaticParams() {
    return (await stockTable.toArray()).map((value: IStock) => ({
        ticker: value.ticker
    }));
}

function Transactions({params}: {params: { ticker: string }}) {
    const {ticker} = params;
    const stock: IStock | undefined = useLiveQuery(
        () => stockTable.where("ticker").equalsIgnoreCase(ticker).first(),
        [ticker]
    );
    const dbService = new DbService();
    const transactions = useLiveQuery<Array<ITransaction>>(
        () => dbService.getTransactionsForTicker(ticker),
        [ticker]
    );
    const priceListService = new PriceListService(dbService);
    const transactionService = new TransactionService(priceListService);
    const priceList = useLiveQuery<IPriceList>(
        () => priceListService.getPriceListForStock(ticker),
        [ticker]
    );
    const transactionListViewModel: TransactionListViewModel = transactionService.getTransactionListViewModel(transactions, priceList);
    const transactionsSummaryViewModel: TransactionsSummaryViewModel = transactionService.getTransactionsSummaryViewModel(transactionListViewModel, priceList);
    return (
    <Container>
        <MyNavbar />
        <Text h1 css={{color: '$neutralLightContrast'}}>{ticker} - {stock?.name}</Text>
        <Summary vm={transactionsSummaryViewModel} />
        <TransactionsList vm={transactionListViewModel} ticker={ticker} /> 
    </Container>
    );
}

export default Transactions;