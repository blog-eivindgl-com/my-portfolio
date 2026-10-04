"use client"
import Image from 'next/image'
import styles from './page.module.css'
import { Container } from '@nextui-org/react'
import MyNavbar from './components/NavbarComponent'

export default function Home() {
  return (
    <Container>
      <MyNavbar />
      <p><a href="/backup">Backup and restore your portfolio</a></p>
      <p><a href="/experiment">Try the read-only calculation experiment (policy undecided)</a></p>
    </Container>
  )
}
