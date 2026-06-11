export type CookieName = keyof typeof cookiesConfig.cookies;

export const cookiesConfig = {
  cookies: {
    "intl-locale": {
      httpOnly: false,
      path: "/",
      sameSite: "lax",
    },
  },
} as const;
