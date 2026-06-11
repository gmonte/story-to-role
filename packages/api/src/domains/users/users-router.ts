import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { organizationMembershipsTable } from "@repo/api/domains/organization-memberships/db/organization-memberships-tables";
import { organizationsTable } from "@repo/api/domains/organizations/db/organizations-tables";
import { organizationSchema } from "@repo/api/domains/organizations/schemas/organization";
import { usersTable } from "@repo/api/domains/users/db/users-tables";
import { userSchema } from "@repo/api/domains/users/schemas/user";
import { db } from "@repo/api/tools/db";
import { createTRPCRouter, protectedProcedure } from "@repo/api/tools/trpc";

const myOrganizationOutput = organizationSchema.extend({
  clerkRole: z.string(),
});

export const usersRouter = createTRPCRouter({
  me: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/users/me",
        tags: ["users"],
        summary: "Returns the current authenticated user",
        protect: true,
      },
    })
    .input(z.void())
    .output(userSchema)
    .query(async ({ ctx }) => {
      const user = await db.query.usersTable.findFirst({
        where: eq(usersTable.clerkUserId, ctx.session.userId),
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: ctx.t.formatMessage({ defaultMessage: "User not found" }),
        });
      }

      return user;
    }),

  myOrganizations: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/users/me/organizations",
        tags: ["users"],
        summary: "Returns organizations the current user belongs to",
        protect: true,
      },
    })
    .input(z.void())
    .output(z.array(myOrganizationOutput))
    .query(async ({ ctx }) => {
      const rows = await db
        .select({
          organization: organizationsTable,
          membership: organizationMembershipsTable,
        })
        .from(organizationMembershipsTable)
        .innerJoin(
          usersTable,
          eq(usersTable.id, organizationMembershipsTable.userId)
        )
        .innerJoin(
          organizationsTable,
          eq(organizationsTable.id, organizationMembershipsTable.organizationId)
        )
        .where(eq(usersTable.clerkUserId, ctx.session.userId));

      return rows.map(({ organization, membership }) => ({
        ...organization,
        clerkRole: membership.clerkRole,
      }));
    }),
});
