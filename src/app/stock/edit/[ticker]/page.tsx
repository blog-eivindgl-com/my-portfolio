import NameEditor from '@/app/components/NameEditor';
export default function EditInstrumentPage({ params }: { params: { ticker: string } }) {
    return <NameEditor store="stocks" recordKey={params.ticker} />;
}
