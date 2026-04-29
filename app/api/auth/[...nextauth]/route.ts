// @ts-nocheck
import NextAuth from "next-auth";
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
        // 🚨 서버가 튕기지 않도록 한글 이름을 안전하게 인코딩 (암호화)
        token.name = user.name ? encodeURIComponent(user.name) : null;
        token.email = user.email;
        // 프로필 이미지 URL에 혹시 모를 한글이 있을 경우를 대비
        token.picture = user.image ? encodeURI(user.image) : null; 
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
        // 🚨 프론트엔드(화면)에서는 정상적인 한글 닉네임으로 보이도록 다시 디코딩 (해독)
        name: typeof token.name === "string" ? decodeURIComponent(token.name) : null,
        email: typeof token.email === "string" ? token.email : null,
        image: typeof token.picture === "string" ? decodeURI(token.picture) : null,
      };
      return session;
    },
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };