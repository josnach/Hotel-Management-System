import { prisma } from '../lib/prisma';
import { publishStaffNotification } from './staffNotificationsSocket';

type NotifyContent = {
  title: string;
  body: string;
  category?: string;
  entityType?: string;
  entityId?: string;
  createdByUserId?: string | null;
};

export async function notifyStaff(
  recipientUserId: string,
  content: NotifyContent,
) {
  try {
    const notification = await prisma.staffNotification.create({
      data: {
        recipientUserId,
        createdByUserId: content.createdByUserId ?? null,
        title: content.title,
        body: content.body,
        category: content.category ?? 'GENERAL',
        entityType: content.entityType ?? null,
        entityId: content.entityId ?? null,
      },
    });

    publishStaffNotification(notification.recipientUserId, notification);
    return notification;
  } catch (error) {
    console.error('[notifyStaff] failed:', error);
    return null;
  }
}

// Notify every active user who has one of these roles.
export async function notifyRoles(
  roles: string[],
  content: NotifyContent,
  excludeUserId?: string,
) {
  try {
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: roles as any },
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
      select: { id: true },
    });

    await Promise.all(users.map((u) => notifyStaff(u.id, content)));
  } catch (error) {
    console.error('[notifyRoles] failed:', error);
  }
}