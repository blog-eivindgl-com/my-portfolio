"use client"
import { FC, Key, useEffect, useMemo } from 'react';
import { useState } from 'react';
import { Selection } from '@react_types/shared';
import { Button, Dropdown, DropdownSectionProps, Input, Radio, Switch } from '@nextui-org/react';
import { accountsTable, transactionsTable } from '../../../../database/database.config';
import { IAccount, ITransaction, TransactionType } from '../../../../database/types/types';
import { Container } from '@nextui-org/react';
import { useLiveQuery } from 'dexie-react-hooks';

interface ITransactionFormProps {
    ticker: string
}

const TransactionForm: FC<ITransactionFormProps> = ({ticker}) => {
    const [transactionType, setTransactionType] = useState(TransactionType.buy);
    const [date, setDate] = useState(new Date());
    const [accounts, setAccounts] = useState<IAccount[]>([]);
    const [selectedAccountId, setSelectedAccountId] = useState<Selection>(new Set(['']));
    useEffect(() => {
        async function loadAccounts() {
            const accounts: IAccount[] = await accountsTable.toArray();
            setAccounts(accounts);
        }
        loadAccounts();
    }, []);
    const selectedAccountIdMemo = useMemo(
        () => Array.from(selectedAccountId).join(','),
        [selectedAccountId],
      );
    function getSelectedAccount(id: string | null): IAccount | undefined {
        return accounts.find((v) => v.id === id);
    }
    function handleTransactionTypeChanged(key: string) {
        switch(key) {
            case 'buy':
                setTransactionType(TransactionType.buy);
                break;
            case 'sell':
                setTransactionType(TransactionType.sell);
                break;
        }
    }
    const createTransaction = async (event: any) => {
        event.preventDefault();
        const transaction: ITransaction = {
            id: crypto.randomUUID(),
            date: new Date(event.target.date.value).getTime(),
            type: transactionType,
            description: event.target.elements['description'].value,
            accountId: getSelectedAccount(selectedAccountIdMemo)?.id || "",
            ticker: ticker,
            shares: Number(event.target.shares.value),
            price: Number(event.target.price.value),
            brokerage: Number(event.target.brokerage.value)
        }
        try {
            const ticker = await transactionsTable.add(transaction);
            event.target.reset();
        } catch (error) {
            console.error(`Failed to create ${transaction}: ${error}`);
        }
    }
    return <Container>
        <h1>Create transaction</h1>
        <form onSubmit={createTransaction}>
            <Radio.Group 
            orientation="horizontal" 
            defaultValue='buy'
            onChange={handleTransactionTypeChanged}>
                <Radio value="buy" color="success" labelColor='success'>Buy</Radio>
                <Radio value="sell" color="error" labelColor='error'>Sell</Radio>
            </Radio.Group><br />
            <Input label='Date:' type="date" id="date" name="name" defaultValue={new Date().getDate().toString()} /><br /><br />
            <Input label='Description:' type="text" id="description" name="description" /><br /><br />
            <Dropdown>
                <Dropdown.Button flat aria-label='Account'>{getSelectedAccount(selectedAccountIdMemo)?.name || "Account"}</Dropdown.Button>
                <Dropdown.Menu 
                disallowEmptySelection 
                selectionMode='single'
                selectedKeys={selectedAccountId} 
                onSelectionChange={setSelectedAccountId}>
                    {accounts.map((account) => (
                    <Dropdown.Item key={account.id}>
                        {account.name}
                    </Dropdown.Item>
                    ))}
                </Dropdown.Menu>
            </Dropdown><br /><br />
            <Input label='Shares:' type="text" id="shares" name="shares" /><br /> <br />
            <Input label='Price:' type="text" id="price" name="price" /><br /> <br />
            <Input label='Brokerage:' type="text" id="brokerage" name="brokerage" /><br /> <br />
            <Button type="submit">Create</Button>
        </form>
    </Container>
}

export default TransactionForm;