export type CookieName = keyof typeof cookiesConfig.cookies;

export const cookiesConfig = {
  cookies: {
    "intl-locale": {
      httpOnly: false,
      path: "/",
      sameSite: "lax",
    },
    // The currency prices show and Checkout charges in, BRL or USD.
    currency: {
      httpOnly: false,
      path: "/",
      sameSite: "lax",
    },
  },
} as const;
