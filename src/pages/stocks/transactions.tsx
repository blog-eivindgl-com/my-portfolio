import Link from 'next/link';
import { useRouter } from 'next/router';
import TransactionsList from '../../components/TransactionsList';
import { stocksTable } from '../../database/database.config';
import { useLiveQuery } from 'dexie-react-hooks';
import { IStock } from '@/database/types/types';

function Transactions() {
    const {ticker} = useRouter().query;
    const tickerString = Array.isArray(ticker) ? ticker[0] : ticker ?? "";
    const stock: IStock | undefined = useLiveQuery(
        () => stocksTable.where("ticker").equalsIgnoreCase(tickerString).first(),
        [ticker]
    );
    return (
    <div>
        <h1>{tickerString} - {stock?.name}</h1>
        <Link href={{
            pathname: "/transactions/create",
            query: { ticker: tickerString }
            }}>Create transaction</Link>
        <TransactionsList ticker={tickerString} />
    </div>
    );
}

export default Transactions;