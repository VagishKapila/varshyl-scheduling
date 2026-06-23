import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        try {
          const user = await prisma.user.findUnique({ where: { email: credentials.email.toLowerCase() } })
          if (!user) return null
          const valid = await bcrypt.compare(credentials.password, user.passwordHash)
          if (!valid) return null
          const cu = await prisma.companyUser.findFirst({ where: { userId: user.id }, include: { company: true } })
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            companyId: cu?.companyId ?? null,
            companyName: cu?.company?.name ?? null,
            needsOnboarding: !cu,
          } as any
        } catch { return null }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.companyId = (user as any).companyId
        token.needsOnboarding = (user as any).needsOnboarding
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id
        ;(session.user as any).companyId = token.companyId
        ;(session.user as any).needsOnboarding = token.needsOnboarding
      }
      return session
    },
  },
  pages: { signIn: '/login' },
  session: { strategy: 'jwt' },
  secret: process.env.NEXTAUTH_SECRET,
}
