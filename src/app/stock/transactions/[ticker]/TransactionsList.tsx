"use client"
import { FC, Key } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { transactionsTable } from '../../../database/database.config';
import { ITransaction, TransactionType } from '../../../database/types/types';
import { Container, CSS, red, Table } from '@nextui-org/react';
import TransactionListViewModel from '@/app/viewmodel/transactions/TransactionListViewModel';
import TransactionService from '@/app/services/TransactionService';
import PriceListService from '@/app/services/PriceListService';
import DbService from '@/app/services/DbService';
import TransactionViewModel from '@/app/viewmodel/transactions/TransactionViewModel';

type Props = {
    ticker: string
}

const TransactionsList: FC<Props> = ({ticker}: Props) => {    
    const transactions = useLiveQuery<Array<ITransaction>>(
        () => transactionsTable.where("ticker").equals(ticker).toArray(),
        [ticker]
    );
    const columns = [
        {
            key: 'date',
            label: 'Date'
        },
        {
            key: 'buy',
            label: 'Buy'
        },
        {
            key: 'sell',
            label: 'Sell'
        },
        {
            key: 'description',
            label: 'Description'
        },
        {
            key: 'price',
            label: 'Price'
        }, 
        {
            key: 'shares',
            label: 'Number'
        },
        {
            key: 'averagePrice',
            label: 'Average price'
        },
        {
            key: 'sharesLeft',
            label: 'Shares left'
        },
        {
            key: 'brokerage',
            label: 'Brokerage'
        },
        {
            key: 'worth',
            label: 'Worth'
        },
        {
            key: 'accumulatedBrokerage',
            label: 'Acc. brokerage'
        },
        {
            key: 'unrealizedWin',
            label: 'Unrealized win/loss'
        },
        {
            key: 'realizedWin',
            label: 'Realized win/loss'
        }
    ]
    const dbService = new DbService();
    const priceListService = new PriceListService(dbService);
    const transactionService = new TransactionService(priceListService);
    const priceList = priceListService.getPriceListForStock(ticker);
    const vm: TransactionListViewModel = transactionService.getTransactionListViewModel(transactions, priceList);
    console.log(vm);
    const renderCell = (vm: TransactionViewModel, columnKey: Key) => {
        const cellValue = vm[columnKey];
        switch (columnKey) {
            case "price":
            case "averagePrice":
            case "brokerage":
            case "accumulatedBrokerage":
            case "worth":
            case "unrealizedWin":
            case "realizedWin":
                return cellValue?.toFixed(3);
            case "buy":
            case "sell":
                return cellValue?.toFixed(2);
            default:
                return cellValue;
        }
    };
    const renderCss = (vm: TransactionViewModel, columnKey: Key): CSS | undefined => {
        function redOrGreenBasedOnValue(value: number | undefined): CSS | undefined {
            if (value && value > 0) {
                return {textAlign: "right", color: "DarkGreen", bgColor: "LightGreen"}
            } else {
                return {textAlign: "right", color: "DarkRed", bgColor: "LightRed"}
            }
        }
        function underlinedOnSell(transactionType: TransactionType): CSS | undefined {
            switch(transactionType) {
                case TransactionType.sell:
                    return {textAlign: "right", borderBottomStyle: "solid", borderBottomWidth: 1};
                default:
                    return {textAlign: "right", borderBottomStyle: "none"};
            }
        }
        switch(columnKey) {
            case "description":
                return {textAlign: "left"};
            case "unrealizedWin":
                return redOrGreenBasedOnValue(vm.unrealizedWin);
            case "realizedWin":
                return redOrGreenBasedOnValue(vm.realizedWin);
            case "accumulatedBrokerage":
                return underlinedOnSell(vm.transaction.type);
            default:
                return {textAlign: "right"};
        }
    };
    return <Container>
        <h2>Transactions</h2>
        <Table
            aria-label="Transactions"
            css={{
                height: "auto",
                minWidth: "100%",
            }}
        >
        <Table.Header columns={columns}>
            {(column) => (
            <Table.Column key={column.key}>{column.label}</Table.Column>
            )}
        </Table.Header>
        <Table.Body items={vm.TransactionViewModels}>
            {(item) => (
            <Table.Row key={item.id}>
                {(columnKey) => <Table.Cell css={renderCss(item, columnKey)}>{renderCell(item, columnKey)}</Table.Cell>}
            </Table.Row>
            )}
        </Table.Body>
        </Table>
    </Container>
}

export default TransactionsList;