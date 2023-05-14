import type { FC } from 'react';
import { transactionsTable } from '../../../../database/database.config';
import { ITransaction } from '../../../../database/types/types';
import { Container } from '@nextui-org/react';

const TransactionForm: FC = () => {
    const createTransaction = async (event: any) => {
        event.preventDefault();
        console.log(event.target.date.value);
        const transaction: ITransaction = {
            date: new Date(event.target.date.value).getTime(),
            type: event.target.type.value,
            description: event.target.type.description,
            accountId: event.target.type.accountId,
            ticker: event.target.ticker.value,
            shares: event.target.shares.value,
            price: event.target.price.value,
            brokerage: event.target.brokerage.value
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
            <label htmlFor="date">Date:</label><br />
            <input type="date" id="date" name="date" /><br /><br />
            <label htmlFor="type">Buy or sell:</label><br />
            <select id="type" name="type">
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
            </select><br /> <br />
            <label htmlFor="description">Description:</label><br />
            <input type="text" id="description" name="description" /><br /> <br />
            <label htmlFor="accountId">Account:</label><br />
            <input type="text" id="accountId" name="accountId" /><br /> <br />
            <label htmlFor="ticker">Ticker:</label><br />
            <input type="text" id="ticker" name="ticker" /><br /> <br />
            <label htmlFor="shares">Shares:</label><br />
            <input type="text" id="shares" name="shares" /><br /> <br />
            <label htmlFor="price">Price:</label><br />
            <input type="text" id="price" name="price" /><br /> <br />
            <label htmlFor="brokerage">Brokerage:</label><br />
            <input type="text" id="brokerage" name="brokerage" /><br /> <br />
            <button type="submit">Create</button>
        </form>
    </Container>
}

export default TransactionForm;