// Server Component — reads searchParams on the server (Next.js 16: searchParams is a Promise)
import LoginForm from './LoginForm'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const port   = typeof params.port === 'string' ? params.port : null

  return <LoginForm port={port} />
}
