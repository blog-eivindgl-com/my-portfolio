"use client"
import Image from 'next/image'
import styles from './page.module.css'
import { Container } from '@nextui-org/react'
import MyNavbar from './components/NavbarComponent'

export default function Home() {
  return (
    <Container>
      <MyNavbar />
    </Container>
  )
}
