import Link from 'next/link';
import StocksList from '../../components/StocksList';

function Stocks() {
    return (
    <div>
        <Link href="stocks/create">Add stock to portfolio</Link>
        <StocksList />
    </div>
    );
}

export default Stocks;