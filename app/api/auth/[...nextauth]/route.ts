// @ts-nocheck
import NextAuth from "next-auth";
import KakaoProvider from "next-auth/providers/kakao";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/prisma";




export const authOptions = {
  adapter: PrismaAdapter(prisma),
  secret: process.env.AUTH_SECRET,
  providers: [
    KakaoProvider({
      clientId: process.env.AUTH_KAKAO_ID,
      clientSecret: process.env.AUTH_KAKAO_SECRET,
      // 🚨 이 옵션을 추가하면 이메일 충돌 에러를 방지할 수 있습니다.
      allowDangerousEmailAccountLinking: true, 
      profile(profile) {
        return {
          id: String(profile.id),
          name: profile.properties?.nickname || profile.kakao_account?.profile?.nickname || "카카오사용자",
          email: profile.kakao_account?.email ?? `${profile.id}@no-email.local`,
          image: profile.properties?.profile_image ?? profile.kakao_account?.profile?.profile_image_url ?? null,
        };
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session?.user) {
        session.user.id = token.id;
        session.user.name = token.name;
      }
      return session;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };