import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string | null;
      email: string | null;
      image: string | null;
      /** ADMIN_EMAILS(+폴백) 기준, 클라이언트 표시용 */
      isAdmin?: boolean;
    };
  }

  interface User {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
    isAdmin?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    name?: string | null;
    email?: string | null;
    picture?: string | null;
  }
}

export {};