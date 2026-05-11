// @ts-nocheck
import type { NextAuthOptions } from "next-auth";
import KakaoProvider from "next-auth/providers/kakao";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

/** NextAuth v4는 서버에서 NEXTAUTH_SECRET / AUTH_SECRET 둘 다 읽습니다. 클라이언트 번들은 NEXTAUTH_URL을 사용합니다. */
const authSecret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  secret: authSecret,
  providers: [
    KakaoProvider({
      clientId: process.env.AUTH_KAKAO_ID,
      clientSecret: process.env.AUTH_KAKAO_SECRET,
      allowDangerousEmailAccountLinking: true,
      profile(profile) {
        return {
          id: String(profile.id),
          name:
            profile.properties?.nickname ||
            profile.kakao_account?.profile?.nickname ||
            "카카오사용자",
          email:
            profile.kakao_account?.email ?? `${profile.id}@no-email.local`,
          image:
            profile.properties?.profile_image ??
            profile.kakao_account?.profile?.profile_image_url ??
            null,
        };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.name = user.name;
        token.email = user.email;
        token.picture = user.image;
      }
      return token;
    },
    async session({ session, token }) {
      const id =
        typeof (token as any).id === "string" && String((token as any).id).trim()
          ? String((token as any).id).trim()
          : typeof token.sub === "string" && token.sub.trim()
            ? token.sub.trim()
            : "";
      session.user = {
        id,
        name: typeof token.name === "string" ? token.name : null,
        email: typeof token.email === "string" ? token.email : null,
        image: typeof token.picture === "string" ? token.picture : null,
      };
      return session;
    },
  },
};
