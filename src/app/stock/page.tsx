"use client"
import { Container } from '@nextui-org/react'
import MyNavbar from '../components/NavbarComponent'
import StockList from './StockList';

export default function Stock() {
    return (
        <Container>
            <MyNavbar />
            <StockList />
        </Container>
    );
}