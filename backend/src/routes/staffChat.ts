import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, HttpError, parse } from '../lib/http';
import { prisma } from '../lib/prisma';
import { publishChatEventToMany } from '../services/staffChatSocket';
import { authenticate } from '../middleware/auth';


export const staffChatRouter = Router();

// Every staff-chat endpoint requires an authenticated user.
staffChatRouter.use(authenticate);
const memberSelect = { id: true, username: true, fullName: true, role: true } as const;
const messageInclude = { sender: { select: memberSelect } } as const;

async function requireMembership(conversationId: string, userId: string) {
  const member = await prisma.chatConversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { id: true },
  });
  if (!member) throw new HttpError(404, 'Conversation not found');
}

// Active colleagues available for a new direct message or group.
staffChatRouter.get('/users', asyncHandler(async (req, res) => {
  const users = await prisma.user.findMany({
    where: { isActive: true, id: { not: req.user!.id } },
    select: memberSelect,
    orderBy: [{ fullName: 'asc' }, { username: 'asc' }],
  });
  res.json(users);
}));

// Conversations are visible only to their members.
staffChatRouter.get('/conversations', asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const memberships = await prisma.chatConversationMember.findMany({
    where: { userId },
    include: {
      conversation: {
        include: {
          members: { include: { user: { select: memberSelect } } },
          messages: { take: 1, orderBy: { createdAt: 'desc' }, include: messageInclude },
        },
      },
    },
    orderBy: { conversation: { updatedAt: 'desc' } },
  });

  const rows = await Promise.all(memberships.map(async (membership) => {
    const c = membership.conversation;
    const unreadCount = await prisma.chatMessage.count({
      where: { conversationId: c.id, senderId: { not: userId }, ...(membership.lastReadAt ? { createdAt: { gt: membership.lastReadAt } } : {}) },
    });
    const otherMembers = c.members.filter((m) => m.userId !== userId).map((m) => m.user);
    const title = c.type === 'GROUP' ? (c.name || 'Group chat') : (otherMembers[0]?.fullName || otherMembers[0]?.username || 'Direct message');
    return {
      id: c.id, type: c.type, name: c.name, title, members: c.members.map((m) => m.user),
      lastMessage: c.messages[0] ?? null, unreadCount, updatedAt: c.updatedAt,
    };
  }));
  res.json(rows);
}));

staffChatRouter.post('/conversations', asyncHandler(async (req, res) => {
  const body = parse(z.object({
    type: z.enum(['DIRECT', 'GROUP']),
    name: z.string().trim().min(1).max(80).optional(),
    memberIds: z.array(z.string().min(1)).min(1).max(100),
  }), req.body);
  const creatorId = req.user!.id;
  const memberIds = [...new Set([...body.memberIds, creatorId])];

  if (body.type === 'DIRECT' && memberIds.length !== 2) throw new HttpError(400, 'A direct conversation must have exactly two staff members');
  if (body.type === 'GROUP' && !body.name) throw new HttpError(400, 'A group chat name is required');

  const activeUsers = await prisma.user.findMany({ where: { id: { in: memberIds }, isActive: true }, select: { id: true } });
  if (activeUsers.length !== memberIds.length) throw new HttpError(400, 'One or more staff members are unavailable');

  if (body.type === 'DIRECT') {
    const existing = await prisma.chatConversation.findFirst({
      where: { type: 'DIRECT', AND: [
        { members: { some: { userId: creatorId } } },
        { members: { some: { userId: memberIds.find((id) => id !== creatorId)! } } },
        { members: { every: { userId: { in: memberIds } } } },
      ] },
      include: { members: { include: { user: { select: memberSelect } } } },
    });
    if (existing && existing.members.length === 2) { res.json(existing); return; }
  }

  const conversation = await prisma.chatConversation.create({
    data: {
      type: body.type,
      name: body.type === 'GROUP' ? body.name : null,
      createdById: creatorId,
      members: { create: memberIds.map((userId) => ({ userId, lastReadAt: userId === creatorId ? new Date() : null })) },
    },
    include: { members: { include: { user: { select: memberSelect } } } },
  });
  const event = { type: 'conversation_created', conversationId: conversation.id };
  publishChatEventToMany(memberIds, event);
  res.status(201).json(conversation);
}));

staffChatRouter.get('/conversations/:id/messages', asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const conversationId = req.params.id;
  await requireMembership(conversationId, userId);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50) || 50));
  const before = req.query.before ? new Date(String(req.query.before)) : undefined;
  if (before && Number.isNaN(before.getTime())) throw new HttpError(400, 'Invalid before timestamp');
  const messages = await prisma.chatMessage.findMany({
    where: { conversationId, ...(before ? { createdAt: { lt: before } } : {}) },
    include: messageInclude,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  res.json(messages.reverse());
}));

staffChatRouter.post('/conversations/:id/messages', asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const conversationId = req.params.id;
  await requireMembership(conversationId, userId);
  const { body } = parse(z.object({ body: z.string().trim().min(1).max(4000) }), req.body);
  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.chatMessage.create({ data: { conversationId, senderId: userId, body }, include: messageInclude });
    await tx.chatConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
    await tx.chatConversationMember.update({ where: { conversationId_userId: { conversationId, userId } }, data: { lastReadAt: created.createdAt } });
    return created;
  });
  const memberRows = await prisma.chatConversationMember.findMany({ where: { conversationId }, select: { userId: true } });
  const event = { type: 'chat_message', conversationId, message };
  publishChatEventToMany(memberRows.map((m) => m.userId), event);
  publishChatEventToMany(memberRows.filter((m) => m.userId !== userId).map((m) => m.userId), { type: 'chat_unread', conversationId });
  res.status(201).json(message);
}));

staffChatRouter.post('/conversations/:id/read', asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const conversationId = req.params.id;
  await requireMembership(conversationId, userId);
  const lastReadAt = new Date();
  await prisma.chatConversationMember.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { lastReadAt },
  });
  res.json({ ok: true, lastReadAt });
  publishChatEventToMany([userId], { type: 'chat_read', conversationId, lastReadAt });
}));
