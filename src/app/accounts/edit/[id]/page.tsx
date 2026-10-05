import NameEditor from '@/app/components/NameEditor';
export default function EditAccountPage({ params }: { params: { id: string } }) {
    return <NameEditor store="accounts" recordKey={params.id} />;
}
