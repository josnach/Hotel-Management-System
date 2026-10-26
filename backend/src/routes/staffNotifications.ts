
import { Router, type Request, type Response } from 'express';


// IMPORTANT:
// Replace this with your existing shared Prisma client import if your
// application already exports one. Do not create multiple clients per route.


// Use the authentication and role middleware already used by your project.
// Adjust these import names/path to match your existing middleware exports.
import { authenticate, requireRole } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { publishStaffNotification } from '../services/staffNotificationsSocket';

const router = Router();

router.use(authenticate);

type AuthenticatedRequest = Request & {
  user?: {
    id: string;
    username?: string;
    role: string;
  };
};

function getUserId(req: Request): string | undefined {
  return (req as AuthenticatedRequest).user?.id;
}

function getText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();

  if (!trimmed || trimmed.length > maxLength) return null;

  return trimmed;
}

// GET /api/staff-notifications
// GET /api/staff-notifications?unreadOnly=true
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const unreadOnly = req.query.unreadOnly === 'true';

    const where = {
      recipientUserId: userId,
      ...(unreadOnly ? { status: 'UNREAD' as const } : {}),
    };

    const [notifications, unreadCount] = await Promise.all([
      prisma.staffNotification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.staffNotification.count({
        where: {
          recipientUserId: userId,
          status: 'UNREAD',
        },
      }),
    ]);

    return res.json({
      notifications,
      unreadCount,
    });
  } catch (error) {
    console.error('Failed to load staff notifications:', error);

    return res.status(500).json({
      message: 'Unable to load notifications',
    });
  }
});

// POST /api/staff-notifications/:id/read
router.post('/:id/read', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const notification = await prisma.staffNotification.findFirst({
      where: {
        id: req.params.id,
        recipientUserId: userId,
      },
    });

    if (!notification) {
      return res.status(404).json({
        message: 'Notification not found',
      });
    }

    const updated = await prisma.staffNotification.update({
      where: { id: notification.id },
      data: {
        status: 'READ',
        readAt: new Date(),
      },
    });

    return res.json({
      message: 'Notification marked as read',
      notification: updated,
    });
  } catch (error) {
    console.error('Failed to mark notification as read:', error);

    return res.status(500).json({
      message: 'Unable to update notification',
    });
  }
});

// POST /api/staff-notifications/:id/archive
router.post('/:id/archive', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const result = await prisma.staffNotification.updateMany({
      where: {
        id: req.params.id,
        recipientUserId: userId,
      },
      data: { status: 'ARCHIVED' },
    });

    if (result.count === 0) {
      return res.status(404).json({
        message: 'Notification not found',
      });
    }

    return res.json({ message: 'Notification archived' });
  } catch (error) {
    console.error('Failed to archive notification:', error);

    return res.status(500).json({
      message: 'Unable to archive notification',
    });
  }
});

// POST /api/staff-notifications
// Only ADMIN and MANAGER may create notifications for other staff.
router.post(
  '/',
  requireRole('ADMIN', 'MANAGER'),
  async (req: Request, res: Response) => {
    try {
      const createdByUserId = getUserId(req);

      if (!createdByUserId) {
        return res.status(401).json({
          message: 'Authentication required',
        });
      }

      const recipientUserId = getText(req.body.recipientUserId, 100);
      const title = getText(req.body.title, 150);
      const body = getText(req.body.body, 2000);
      const category = getText(req.body.category ?? 'GENERAL', 50);

      if (!recipientUserId || !title || !body || !category) {
        return res.status(400).json({
          message:
            'recipientUserId, title and body are required. Check field lengths.',
        });
      }

      // Verify the recipient exists and is active.
      // If your User model uses a different active field, adjust this query.
      const recipient = await prisma.user.findFirst({
        where: {
          id: recipientUserId,
          isActive: true,
        },
        select: { id: true },
      });

      if (!recipient) {
        return res.status(404).json({
          message: 'Active recipient not found',
        });
      }

      const entityType = getText(req.body.entityType, 50);
      const entityId = getText(req.body.entityId, 100);

      const notification = await prisma.staffNotification.create({
  data: {
    recipientUserId,
   createdByUserId,
    title,
    body,
    category,
    entityType: entityType || null,
    entityId: entityId || null,
  },
});

   // Publish only after the database write succeeds.
publishStaffNotification(notification.recipientUserId, notification);

res.status(201).json(notification);
    } catch (error) {
      console.error('Failed to create staff notification:', error);

      return res.status(500).json({
        message: 'Unable to create notification',
      });
    }
  },
);

export default router;
