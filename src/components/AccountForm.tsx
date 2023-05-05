import type { FC } from 'react';
import { accountsTable } from '../database/database.config';
import { IAccount } from '../database/types/types';

const AccountForm: FC = () => {
    const createAccount = async (event: any) => {
        event.preventDefault();
        const account: IAccount = {
            name: event.target.name.value
        }
        try {
            const id = await accountsTable.add(account);
            event.target.reset();
        } catch (error) {
            console.error(`Failed to create ${account}: ${error}`);
        }
    }
    return <div>
        <h1>Create account</h1>
        <form onSubmit={createAccount}>
            <label htmlFor="name">Name:</label><br />
            <input type="text" id="name" name="name" /><br /> <br />
            <button type="submit">Create</button>
        </form>
    </div>
}

export default AccountForm;