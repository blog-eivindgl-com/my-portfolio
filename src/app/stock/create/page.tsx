"use client"
import { Container, Link } from '@nextui-org/react'
import MyNavbar from '../../components/NavbarComponent'
import StockForm from './StockForm';

export default function Accounts() {
    return (
        <Container>
            <MyNavbar />
            <StockForm />
        </Container>
    );
}