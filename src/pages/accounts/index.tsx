import Link from 'next/link';
import AccountsList from '../../components/AccountsList';

function Accounts() {
    return (
    <div>
        <Link href="accounts/create">Create account</Link>
        <AccountsList />
    </div>
    );
}

export default Accounts;