/** Shape attached to request.user by the JWT strategy. */
export interface AuthenticatedUser {
  userId: string;
  email?: string | null;
  sessionId: string;
  roles: string[];
  permissions: string[];
}
