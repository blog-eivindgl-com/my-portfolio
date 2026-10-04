import TransactionEditor from './TransactionEditor';

export default function EditTransactionPage({ params }: { params: { ticker: string; id: string } }) {
    return <TransactionEditor ticker={params.ticker} id={params.id} />;
}
