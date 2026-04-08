import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: [
    "/top-blog/:path*",
    "/place/:path*",
    "/place-review/:path*",
    "/place-analysis/:path*",
  ],
};