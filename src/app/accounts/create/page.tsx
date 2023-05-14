"use client"
import { Container, Link } from '@nextui-org/react'
import MyNavbar from '../../components/NavbarComponent'
import AccountForm from './AccountForm';

export default function Accounts() {
    return (
        <Container>
            <MyNavbar />
            <AccountForm />
        </Container>
    );
}