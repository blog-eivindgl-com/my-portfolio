import { Navbar, Text, Button, Link, Switch, useTheme } from "@nextui-org/react"
import { useTheme as useNextTheme } from 'next-themes'

export default function MyNavbar() {
  const { setTheme } = useNextTheme();
  const { isDark, type } = useTheme();

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
          <Switch
          checked={isDark}
          onChange={(e) => setTheme(e.target.checked ? 'dark' : 'light')} 
          />
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