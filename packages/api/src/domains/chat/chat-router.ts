import { z } from "zod";

import { db } from "@repo/api/tools/db";
import {
  createTRPCRouter,
  rateLimited,
  userProcedure,
} from "@repo/api/tools/trpc";
import { realtimeSubscriptionSchema } from "@repo/api/domains/tasks/schemas/task";

import { ChatService } from "./chat-service";
import { chatContextSchema, chatMessageSchema } from "./schemas/chat-message";

export const chatRouter = createTRPCRouter({
  messages: userProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/chat/messages",
        tags: ["chat"],
        summary: "Lists the messages of one of the current user's chats",
        protect: true,
      },
    })
    .input(z.object({ context: chatContextSchema }))
    .output(z.array(chatMessageSchema))
    .query(({ ctx, input }) =>
      new ChatService(db).list({ userId: ctx.userId, context: input.context })
    ),

  send: userProcedure
    .use(rateLimited("chatMessage"))
    .meta({
      openapi: {
        method: "POST",
        path: "/chat/messages",
        tags: ["chat"],
        summary: "Sends a message and starts the turn that answers it",
        protect: true,
      },
    })
    .input(
      z.object({
        context: chatContextSchema,
        message: z.string().trim().min(1).max(8000),
      })
    )
    .output(
      z.object({
        message: chatMessageSchema,
        realtime: realtimeSubscriptionSchema,
      })
    )
    .mutation(({ ctx, input }) =>
      new ChatService(db).send({ userId: ctx.userId, ...input })
    ),
});
