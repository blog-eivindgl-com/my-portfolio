import { Navbar, Text, Button, Link } from "@nextui-org/react"

export default function MyNavbar() {
    return (
      <Navbar>
        <Navbar.Brand>
          <Navbar.Brand as={Link} href="/">My Portfolio</Navbar.Brand>
        </Navbar.Brand>
        <Navbar.Content hideIn="md">
          <Navbar.Link href="/stock">Stock</Navbar.Link>
          <Navbar.Link href="/accounts">Accounts</Navbar.Link>
        </Navbar.Content>
        <Navbar.Content>
          <Navbar.Link href="#">Login</Navbar.Link>
          <Navbar.Item>
            <Button auto flat href="#">
              Sign Up
            </Button>
          </Navbar.Item>
        </Navbar.Content>
      </Navbar>
    );
}