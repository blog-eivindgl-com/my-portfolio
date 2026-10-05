import NameEditor from '@/app/components/NameEditor';
export default function EditInstrumentPage({ params }: { params: { ticker: string } }) {
    return <NameEditor store="instruments" recordKey={params.ticker} />;
}
