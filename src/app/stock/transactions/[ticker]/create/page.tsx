"use client"
import TransactionForm from './TransactionForm'

function Create({params}: {params: { ticker: string }}) {
    return (
    <div>
        <TransactionForm ticker={params.ticker} />
    </div>
    );
}

export default Create;