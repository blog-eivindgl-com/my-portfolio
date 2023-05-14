import type { FC } from 'react';
import { stockTable } from '../../database/database.config';
import { IStock } from '../../database/types/types';
import { Container } from '@nextui-org/react';

const StockForm: FC = () => {
    const createStock = async (event: any) => {
        event.preventDefault();
        const stock: IStock = {
            ticker: event.target.ticker.value,
            name: event.target.name.value
        }
        try {
            const ticker = await stockTable.add(stock);
            event.target.reset();
        } catch (error) {
            console.error(`Failed to create ${stock}: ${error}`);
        }
    }
    return <Container>
        <h1>Create stock</h1>
        <form onSubmit={createStock}>
            <label htmlFor="ticker">Ticker:</label><br />
            <input type="text" id="ticker" name="ticker" /><br /> <br />
            <label htmlFor="name">Name:</label><br />
            <input type="text" id="name" name="name" /><br /> <br />
            <button type="submit">Create</button>
        </form>
    </Container>
}

export default StockForm;