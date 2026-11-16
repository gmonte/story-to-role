/**
 * Privacy facts the interface states, kept with the infrastructure they
 * describe (privacy spec, "Export and deletion").
 */
export const privacySettings = {
  // Neon's history window (point-in-time restore): how long a deleted
  // account can still be restored from. The Free plan keeps 6 hours; this
  // must follow the window set on the production project.
  databaseHistoryHours: 6,
};
