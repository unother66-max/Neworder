// @ts-nocheck
import KakaoProvider from "next-auth/providers/kakao";

export const authOptions = {
  secret: process.env.AUTH_SECRET,
  providers: [
    KakaoProvider({
      clientId: process.env.AUTH_KAKAO_ID,
      clientSecret: process.env.AUTH_KAKAO_SECRET,
      profile(profile) {
        return {
          id: String(profile.id),
          name: profile.properties?.nickname ?? "카카오사용자",
          email: profile.kakao_account?.email ?? null,
          image: profile.properties?.profile_image ?? null,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
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
      // Ensure session.user.id is always populated (fallback to token.sub)
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