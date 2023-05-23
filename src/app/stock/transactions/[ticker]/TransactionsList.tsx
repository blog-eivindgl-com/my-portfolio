"use client"
import { FC, Key } from 'react';
import { TransactionType } from '../../../database/types/types';
import { Container, CSS, Table } from '@nextui-org/react';
import TransactionListViewModel from '@/app/viewmodel/transactions/TransactionListViewModel';
import TransactionViewModel from '@/app/viewmodel/transactions/TransactionViewModel';
import { Alignment } from '@react-types/shared';

type Props = {
    vm: TransactionListViewModel
}

const TransactionsList: FC<Props> = ({vm}: Props) => {
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
        const css: CSS = {};
        if (getAllignmentForColumn(columnKey) === "end") {
            css.textAlign = "end";
        } else {
            css.textAlign = "start";
        }

        function redOrGreenBasedOnValue(value: number | undefined): void {
            if (value && value > 0) {
                css.bg = "$successLight";
                css.color = "$successLightContrast";
            } else if (value && value < 0) {
                css.bg = "$errorLight";
                css.color = "$errorLightContrast";
            }
        }
        function underlinedOnSell(transactionType: TransactionType): void {
            switch(transactionType) {
                case TransactionType.sell:
                    css.borderBottomStyle = "solid";
                    css.borderBottomWidth = 1;
                default:
                    css.borderBottomStyle = "none";
            }
        }
        switch(columnKey) {
            case "description":
                css.textAlign = "start";
                break;
            case "unrealizedWin":
                redOrGreenBasedOnValue(vm.unrealizedWin);
                break;
            case "realizedWin":
                redOrGreenBasedOnValue(vm.realizedWin);
                break;
            case "accumulatedBrokerage":
                underlinedOnSell(vm.transaction.type);
                break;
        }
        return css;
    };
    const getAllignmentForColumn = (columnKey: Key): Alignment => {
        switch(columnKey) {
            case "description":
                return "start";
            default:
                return "end";
        }
    }
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
            <Table.Column align={getAllignmentForColumn(column.key)} key={column.key}>{column.label}</Table.Column>
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