"use client"
import { FC } from 'react';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { transactionsTable } from '../../../database/database.config';
import { ITransaction, TransactionType } from '../../../database/types/types';
import { Table } from '@nextui-org/react';

type Props = {
    ticker: string
}

class TransactionViewModel {
    constructor(public transaction: ITransaction) {
        this.id = transaction.id;
        // Values below will be set by the map function based on the order of transactions
        this._averagePrice = transaction.price;
        this._sharesLeft = transaction.shares;
        this._worth = transaction.price * transaction.shares;  // Price will be replaced with current price up until shares are sold. Current price is registered every now and then.
        this._accumulatedBrokerage = this.brokerage;  // Will be accumulated until first sell after buy date
        this._unrealizedWin = undefined;  // Will be replaced with current price * shares up until shares are sold.
        this._realizedWin = undefined; // Will be replaced with actual win/loss when shares are sold
    }
    
    [key: string]: any

    get date(): string {
        return new Date(this.transaction.date).toLocaleDateString();
    }

    get description(): string {
        return this.transaction.description;
    }

    get buy(): number | undefined {
        if (this.transaction.type === TransactionType.buy) {
            return this.transaction.price * this.transaction.shares + this.transaction.brokerage;
        }
        return undefined;
    }

    get sell(): number | undefined {
        if (this.transaction.type === TransactionType.sell) {
            return this.transaction.price * this.transaction.shares;
        }
        return undefined;
    }

    get price(): number {
        return this.transaction.price;
    }

    get shares(): number {
        return this.transaction.shares;
    }

    get marketValuePerDate(): number {
        return this.sharesLeft * this.price;
    }

    get brokerage(): number {
        return this.transaction.brokerage;
    }

    // Below properties must be calculated by the map function
    _averagePrice: number;
    get averagePrice(): number {
        return this._averagePrice;
    }
    set averagePrice(value: number) {
        this._averagePrice = value;
    }

    _sharesLeft: number;
    get sharesLeft(): number {
        return this._sharesLeft;
    }
    set sharesLeft(value: number) {
        this._sharesLeft = value;
    }

    _worth: number;
    get worth(): number {
        return this._worth;
    }
    set worth(value: number) {
        this._worth = value;
    }

    _accumulatedBrokerage: number;
    get accumulatedBrokerage(): number {
        return this._accumulatedBrokerage;
    }
    set accumulatedBrokerage(value: number) {
        this._accumulatedBrokerage = value;
    }

    _unrealizedWin: number | undefined;
    get unrealizedWin(): number | undefined {
        return this._unrealizedWin;
    }
    set unrealizedWin(value: number | undefined) {
        this._unrealizedWin = value;
    }

    _realizedWin: number | undefined;
    get realizedWin(): number | undefined {
        return this._realizedWin;
    }
    set realizedWin(value: number | undefined) {
        this._realizedWin = value;
    }
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
    const data: TransactionViewModel[] = 
        transactions?.sort(t => t.date)
        .map(t => new TransactionViewModel(t)) || [];
    //const data = transactions?.map(t => t) || [];
    return <div>
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
        <Table.Body items={data}>
            {(item) => (
            <Table.Row key={item.id}>
                {(columnKey) => <Table.Cell>{item[columnKey]}</Table.Cell>}
            </Table.Row>
            )}
        </Table.Body>
        </Table>
    </div>
}

export default TransactionsList;