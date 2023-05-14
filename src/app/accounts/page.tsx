"use client"
import { Container, Link } from '@nextui-org/react'
import MyNavbar from '../components/NavbarComponent'
import AccountsList from './AccountsList';

export default function Accounts() {
    return (
        <Container>
            <MyNavbar />
            <Link href="accounts/create">Create account</Link>
            <AccountsList />
        </Container>
    );
}