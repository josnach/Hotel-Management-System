
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, parse } from '../lib/http';
import {
  clockIn,
  clockOut,
  getCurrentWorkShift,
  getMyShiftHistory,
  resolveTodaySchedule,
} from '../services/staffWorkShifts';

export const workShiftsRouter = Router();

/**
 * GET /api/work-shifts/me
 * Returns the signed-in employee's schedule and current work shift.
 */
workShiftsRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;

    const [today, currentShift] = await Promise.all([
      resolveTodaySchedule(userId),
      getCurrentWorkShift(userId),
    ]);

    res.json({
      today,
      currentShift,
      canClockIn:
        !today.isDayOff &&
        !!today.schedule &&
        !currentShift,
    });
  }),
);

/**
 * POST /api/work-shifts/clock-in
 * Starts an individual employee work shift.
 */
workShiftsRouter.post(
  '/clock-in',
  asyncHandler(async (req, res) => {
    const shift = await clockIn(
      req.user!.id,
      req.user!.role,
    );

    res.status(201).json({
      message: 'Work shift started successfully',
      shift,
    });
  }),
);

/**
 * POST /api/work-shifts/clock-out
 * Closes the signed-in employee's current work shift.
 */
workShiftsRouter.post(
  '/clock-out',
  asyncHandler(async (req, res) => {
    const body = parse(
      z.object({
        note: z.string().max(500).optional(),
      }),
      req.body ?? {},
    );

    const shift = await clockOut(
      req.user!.id,
      body.note,
    );

    res.json({
      message: 'Work shift closed successfully',
      shift,
    });
  }),
);

/**
 * GET /api/work-shifts/history?page=1&pageSize=20
 * Returns only the signed-in employee's own shift history.
 */
workShiftsRouter.get(
  '/history',
  asyncHandler(async (req, res) => {
    const query = parse(
      z.object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(20),
      }),
      req.query,
    );

    const history = await getMyShiftHistory(
      req.user!.id,
      query.page,
      query.pageSize,
    );

    res.json(history);
  }),
);
