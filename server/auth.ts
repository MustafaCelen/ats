import type { Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import type { PublicUser } from "@shared/schema";

declare module "express-session" {
  interface SessionData {
    userId: number;
  }
}

export type AuthUser = PublicUser & { assignedJobIds: number[] };

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const user = await storage.getUserById(req.session.userId);
  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ message: "Unauthorized" });
  }
  const assignedJobIds =
    user.role === "admin"
      ? []
      : await storage.getAssignedJobIds(user.id);
  const { passwordHash: _, googleAccessToken: _a, googleRefreshToken: _b, ...publicFields } = user;
  req.user = { ...publicFields, hasGoogleCalendar: !!user.googleAccessToken, assignedJobIds };
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
}

export function requireHiringManagerOrAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role === "assistant") {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
}
