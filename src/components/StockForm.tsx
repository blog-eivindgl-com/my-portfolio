import type { FC } from 'react';
import { stocksTable } from '../database/database.config';
import { IStock } from '../database/types/types';

const StockForm: FC = () => {
    const createStock = async (event: any) => {
        event.preventDefault();
        const stock: IStock = {
            ticker: event.target.ticker.value,
            name: event.target.name.value
        }
        try {
            const ticker = await stocksTable.add(stock);
            event.target.reset();
        } catch (error) {
            console.error(`Failed to create ${stock}: ${error}`);
        }
    }
    return <div>
        <h1>Create stock</h1>
        <form onSubmit={createStock}>
            <label htmlFor="ticker">Ticker:</label><br />
            <input type="text" id="ticker" name="ticker" /><br /> <br />
            <label htmlFor="name">Name:</label><br />
            <input type="text" id="name" name="name" /><br /> <br />
            <button type="submit">Create</button>
        </form>
    </div>
}

export default StockForm;